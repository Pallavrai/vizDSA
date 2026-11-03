import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

/** Runs a LeetCode-style Java solution under JDI and writes a vizDSA trace to stdout. */
public class Tracer {
    static final int MAX_ITEMS = 2000;
    static final int MAX_OBJECTS = 5000;
    static final String WORK = "/tmp/w";
    static final String PRELUDE = "import java.util.*; import java.util.function.*; import java.util.stream.*; ";

    static PrintStream realOut;
    static final List<String> steps = Collections.synchronizedList(new ArrayList<>());
    static StringBuilder childOut = new StringBuilder();
    static long stepLimit, traceBytes, stdoutCap, seconds;
    static long size = 0;
    static boolean finished = false;
    static Process child;

    static class Rec {
        int id; String method; Map<String, String> snapshot = new HashMap<>(); List<ObjectReference> roots = new ArrayList<>();
        String returnJson;
    }

    static final ArrayList<Rec> mirror = new ArrayList<>();
    static int nextFrame = 1;
    static final Map<String, String> heapSeen = new HashMap<>();

    // ---- Minimal JSON ----
    static String q(String s) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 32) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }

    @SuppressWarnings("unchecked")
    static class Json {
        final String s; int i = 0;
        Json(String s) { this.s = s; }
        Object value() {
            while (Character.isWhitespace(s.charAt(i))) i++;
            char c = s.charAt(i);
            if (c == '{') {
                Map<String, Object> m = new HashMap<>(); i++;
                while (true) {
                    while (Character.isWhitespace(s.charAt(i)) || s.charAt(i) == ',') i++;
                    if (s.charAt(i) == '}') { i++; return m; }
                    String k = (String) value();
                    while (s.charAt(i) != ':') i++;
                    i++;
                    m.put(k, value());
                }
            }
            if (c == '"') {
                StringBuilder b = new StringBuilder(); i++;
                while (s.charAt(i) != '"') {
                    char d = s.charAt(i++);
                    if (d != '\\') { b.append(d); continue; }
                    char e = s.charAt(i++);
                    switch (e) {
                        case 'n' -> b.append('\n'); case 't' -> b.append('\t'); case 'r' -> b.append('\r');
                        case 'b' -> b.append('\b'); case 'f' -> b.append('\f');
                        case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; }
                        default -> b.append(e);
                    }
                }
                i++;
                return b.toString();
            }
            int st = i;
            while (i < s.length() && "-+.eE0123456789".indexOf(s.charAt(i)) >= 0) i++;
            return Double.valueOf(s.substring(st, i));
        }
    }

    static synchronized void finish(String status, String resultJson, String message, Integer line) {
        if (finished) return;
        finished = true;
        StringBuilder out = new StringBuilder("{\"version\":1,\"language\":\"java\",\"status\":\"").append(status).append("\",");
        if (resultJson != null) out.append("\"result\":").append(resultJson).append(',');
        if (message == null) out.append("\"error\":null,");
        else out.append("\"error\":{\"message\":").append(q(message)).append(line != null ? ",\"line\":" + line : "").append("},");
        out.append("\"stdout\":").append(q(childOut.toString())).append(",\"steps\":[");
        synchronized (steps) { out.append(String.join(",", steps)); }
        out.append("]}");
        realOut.write(out.toString().getBytes(StandardCharsets.UTF_8), 0, out.toString().getBytes(StandardCharsets.UTF_8).length);
        realOut.flush();
        if (child != null) child.destroyForcibly();
        Runtime.getRuntime().halt(0);
    }

    // ---- Values ----
    static String value(Value v, ArrayDeque<ObjectReference> queue) {
        if (v == null || v instanceof VoidValue) return "null";
        if (v instanceof BooleanValue b) return String.valueOf(b.value());
        if (v instanceof CharValue c) return q(String.valueOf(c.value()));
        if (v instanceof DoubleValue || v instanceof FloatValue) {
            double d = ((PrimitiveValue) v).doubleValue();
            return Double.isFinite(d) ? String.valueOf(d) : "{\"text\":" + q(String.valueOf(d)) + "}";
        }
        if (v instanceof LongValue l) {
            return Math.abs(l.value()) <= (1L << 53) ? String.valueOf(l.value()) : "{\"text\":\"" + l.value() + "\"}";
        }
        if (v instanceof PrimitiveValue p) return String.valueOf(p.longValue());
        if (v instanceof StringReference s) return q(s.value());
        ObjectReference o = (ObjectReference) v;
        String type = o.referenceType().name();
        if (type.startsWith("java.lang.") && !type.equals("java.lang.Object")) {
            Field f = o.referenceType().fieldByName("value");
            if (f != null && o.getValue(f) instanceof PrimitiveValue) return value(o.getValue(f), queue);
            return "{\"text\":" + q("<" + simple(type) + ">") + "}";
        }
        if (type.contains("$$Lambda") || type.contains("$Lambda")) return "{\"text\":\"<lambda>\"}";
        queue.add(o);
        return "{\"ref\":\"j" + o.uniqueID() + "\"}";
    }

    static String simple(String type) { return type.substring(Math.max(type.lastIndexOf('.'), type.lastIndexOf('$')) + 1); }

    static Value get(ObjectReference o, String field) {
        Field f = o.referenceType().fieldByName(field);
        return f == null ? null : o.getValue(f);
    }

    static int intField(ObjectReference o, String field) { return ((PrimitiveValue) get(o, field)).intValue(); }

    static void appendValues(List<String> out, List<? extends Value> items, ArrayDeque<ObjectReference> queue) {
        for (Value x : items) out.add(value(x, queue));
    }

    static List<Value> mapEntries(ObjectReference map) {
        List<Value> flat = new ArrayList<>();
        String type = map.referenceType().name();
        if (type.equals("java.util.TreeMap")) {
            walkTree((ObjectReference) get(map, "root"), flat);
            return flat;
        }
        Value head = get(map, "head"); // LinkedHashMap keeps insertion order
        if (head instanceof ObjectReference n) {
            while (n != null && flat.size() < MAX_ITEMS * 2) {
                flat.add(get(n, "key")); flat.add(get(n, "value"));
                n = (ObjectReference) get(n, "after");
            }
            return flat;
        }
        Value table = get(map, "table");
        if (table instanceof ArrayReference a) {
            for (Value bucket : a.getValues()) {
                ObjectReference n = (ObjectReference) bucket;
                while (n != null && flat.size() < MAX_ITEMS * 2) {
                    if (n.referenceType().fieldByName("key") == null) break;
                    flat.add(get(n, "key")); flat.add(get(n, "value"));
                    n = (ObjectReference) get(n, "next");
                }
            }
        }
        return flat;
    }

    static void walkTree(ObjectReference n, List<Value> flat) {
        if (n == null || flat.size() >= MAX_ITEMS * 2) return;
        walkTree((ObjectReference) get(n, "left"), flat);
        flat.add(get(n, "key")); flat.add(get(n, "value"));
        walkTree((ObjectReference) get(n, "right"), flat);
    }

    static String heapObject(ObjectReference o, ArrayDeque<ObjectReference> queue) {
        String type = o.referenceType().name();
        String kind;
        List<String> items = new ArrayList<>();
        boolean truncated = false;
        if (o instanceof ArrayReference a) {
            kind = "list";
            truncated = a.length() > MAX_ITEMS;
            appendValues(items, a.getValues(0, Math.min(a.length(), MAX_ITEMS)), queue);
            type = simple(type);
        } else if (type.equals("java.util.ArrayList") || type.equals("java.util.Stack") || type.equals("java.util.Vector") || type.equals("java.util.PriorityQueue") || type.equals("java.util.Arrays$ArrayList")) {
            kind = type.endsWith("Stack") ? "stack" : "list";
            ArrayReference data = (ArrayReference) get(o, type.endsWith("PriorityQueue") ? "queue" : type.endsWith("Arrays$ArrayList") ? "a" : "elementData");
            int count = type.endsWith("ArrayList") && !type.contains("$") ? intField(o, "size")
                : type.endsWith("PriorityQueue") ? intField(o, "size")
                : type.contains("$") ? data.length() : intField(o, "elementCount");
            truncated = count > MAX_ITEMS;
            if (count > 0) appendValues(items, data.getValues(0, Math.min(count, MAX_ITEMS)), queue);
        } else if (type.equals("java.util.LinkedList")) {
            kind = "queue";
            ObjectReference n = (ObjectReference) get(o, "first");
            while (n != null && items.size() < MAX_ITEMS) { items.add(value(get(n, "item"), queue)); n = (ObjectReference) get(n, "next"); }
        } else if (type.equals("java.util.ArrayDeque")) {
            kind = "queue";
            ArrayReference data = (ArrayReference) get(o, "elements");
            int head = intField(o, "head"), tail = intField(o, "tail"), cap = data.length();
            for (int i = head; i != tail && items.size() < MAX_ITEMS; i = (i + 1) % cap) items.add(value(data.getValue(i), queue));
        } else if (type.equals("java.util.HashMap") || type.equals("java.util.LinkedHashMap") || type.equals("java.util.TreeMap")) {
            kind = "map";
            List<Value> flat = mapEntries(o);
            for (int i = 0; i + 1 < flat.size(); i += 2) items.add("[" + value(flat.get(i), queue) + "," + value(flat.get(i + 1), queue) + "]");
        } else if (type.equals("java.util.HashSet") || type.equals("java.util.LinkedHashSet") || type.equals("java.util.TreeSet")) {
            kind = "set";
            ObjectReference map = (ObjectReference) get(o, type.endsWith("TreeSet") ? "m" : "map");
            List<Value> flat = mapEntries(map);
            for (int i = 0; i < flat.size(); i += 2) items.add(value(flat.get(i), queue));
        } else if (type.startsWith("java.") || type.startsWith("jdk.") || type.startsWith("sun.")) {
            return "{\"id\":\"j" + o.uniqueID() + "\",\"kind\":\"object\",\"typeName\":" + q(simple(type)) + ",\"contents\":{}}";
        } else {
            StringBuilder fields = new StringBuilder("{");
            for (Field f : o.referenceType().allFields()) {
                if (f.isStatic() || f.isSynthetic()) continue;
                if (fields.length() > 1) fields.append(',');
                fields.append(q(f.name())).append(':').append(value(o.getValue(f), queue));
            }
            return "{\"id\":\"j" + o.uniqueID() + "\",\"kind\":\"object\",\"typeName\":" + q(simple(type)) + ",\"contents\":" + fields + "}}";
        }
        return "{\"id\":\"j" + o.uniqueID() + "\",\"kind\":\"" + kind + "\",\"typeName\":" + q(simple(type)) + ",\"contents\":[" + String.join(",", items) + "]" + (truncated ? ",\"truncated\":true" : "") + "}";
    }

    static void emit(String event, Rec rec, int line, StackFrame frame, String returnJson, String message) throws Exception {
        if (steps.size() >= stepLimit) {
            finish("step_limit", null, "Stopped after " + stepLimit + " steps. Try a smaller test case, or look for a loop that never ends.", line);
        }
        ArrayDeque<ObjectReference> queue = new ArrayDeque<>();
        StringBuilder changes = new StringBuilder();
        if (frame != null) {
            Map<String, String> current = new HashMap<>();
            List<ObjectReference> roots = new ArrayList<>();
            for (LocalVariable lv : frame.visibleVariables()) {
                ArrayDeque<ObjectReference> mine = new ArrayDeque<>();
                current.put(lv.name(), value(frame.getValue(lv), mine));
                roots.addAll(mine);
            }
            ObjectReference self = frame.thisObject();
            if (self != null && self.referenceType().allFields().stream().anyMatch(f -> !f.isStatic() && !f.isSynthetic())) {
                current.put("this", "{\"ref\":\"j" + self.uniqueID() + "\"}");
                roots.add(self);
            }
            for (var e : current.entrySet()) {
                if (!e.getValue().equals(rec.snapshot.get(e.getKey()))) {
                    if (changes.length() > 0) changes.append(',');
                    changes.append("{\"name\":").append(q(e.getKey())).append(",\"value\":").append(e.getValue()).append('}');
                }
            }
            for (String name : rec.snapshot.keySet()) {
                if (!current.containsKey(name)) {
                    if (changes.length() > 0) changes.append(',');
                    changes.append("{\"name\":").append(q(name)).append('}');
                }
            }
            rec.snapshot = current;
            rec.roots = roots;
        }
        for (Rec r : mirror) queue.addAll(r.roots);
        StringBuilder heap = new StringBuilder();
        Set<Long> seen = new HashSet<>();
        while (!queue.isEmpty() && seen.size() < MAX_OBJECTS) {
            ObjectReference o = queue.poll();
            if (!seen.add(o.uniqueID())) continue;
            String json;
            try { json = heapObject(o, queue); } catch (ObjectCollectedException e) { continue; }
            String id = "j" + o.uniqueID();
            if (!json.equals(heapSeen.get(id))) {
                heapSeen.put(id, json);
                if (heap.length() > 0) heap.append(',');
                heap.append(json);
            }
        }
        StringBuilder step = new StringBuilder("{\"event\":\"").append(event).append("\",\"line\":").append(line)
            .append(",\"frameId\":").append(rec.id).append(",\"functionName\":").append(q(rec.method))
            .append(",\"frameChanges\":[").append(changes).append("],\"heapChanges\":[").append(heap).append(']');
        if (returnJson != null) step.append(",\"returnValue\":").append(returnJson);
        if (message != null) step.append(",\"message\":").append(q(message));
        step.append('}');
        size += step.length();
        if (size > traceBytes) finish("step_limit", null, "Stopped because the recording grew too large. Try a smaller test case.", line);
        steps.add(step.toString());
    }

    static boolean isStudent(Location l) {
        try { return l.sourceName().equals("Solution.java"); } catch (AbsentInformationException e) { return false; }
    }

    static List<StackFrame> studentFrames(ThreadReference t) throws Exception {
        List<StackFrame> out = new ArrayList<>();
        for (StackFrame f : t.frames()) if (isStudent(f.location())) out.add(f);
        Collections.reverse(out); // oldest first, matching mirror
        return out;
    }

    static void syncFrames(List<StackFrame> frames) throws Exception {
        int common = 0;
        while (common < mirror.size() && common < frames.size() && mirror.get(common).method.equals(frames.get(common).location().method().name())) common++;
        while (mirror.size() > common) {
            Rec r = mirror.get(mirror.size() - 1);
            emit("return", r, frames.isEmpty() ? 0 : frames.get(Math.min(common, frames.size() - 1)).location().lineNumber(), null, r.returnJson == null ? "null" : r.returnJson, null);
            mirror.remove(mirror.size() - 1);
        }
        for (int i = common; i < frames.size(); i++) {
            Rec r = new Rec();
            r.id = nextFrame++;
            r.method = frames.get(i).location().method().name();
            mirror.add(r);
            emit("call", r, frames.get(i).location().lineNumber(), frames.get(i), null, null);
        }
    }

    public static void main(String[] argv) throws Exception {
        if (argv.length > 0 && argv[0].equals("--warmup")) { warmup(); return; }
        realOut = new PrintStream(new FileOutputStream(FileDescriptor.out), false);
        Map<String, Object> payload = cast(new Json(new String(System.in.readAllBytes(), StandardCharsets.UTF_8)).value());
        Map<String, Object> driver = cast(payload.get("driver"));
        Map<String, Object> limits = cast(payload.get("limits"));
        stepLimit = ((Double) limits.get("steps")).longValue();
        seconds = ((Double) limits.get("seconds")).longValue();
        traceBytes = ((Double) limits.get("traceBytes")).longValue();
        stdoutCap = ((Double) limits.get("stdoutBytes")).longValue();
        String target = (String) driver.get("method");

        Files.createDirectories(Path.of(WORK, "out"));
        Path solution = Path.of(WORK, "Solution.java");
        // Prelude stays on line 1 so the student's line numbers do not move.
        Files.writeString(solution, PRELUDE + payload.get("code"));
        Path main = Path.of(WORK, "Main.java");
        Files.writeString(main, (String) driver.get("main"));
        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = javac.getStandardFileManager(diags, null, null)) {
            boolean ok = javac.getTask(null, fm, diags, List.of("-g", "-nowarn", "-cp", "/opt/vizdsa/support", "-d", WORK + "/out"), null, fm.getJavaFileObjects(solution, main)).call();
            if (!ok) {
                for (Diagnostic<? extends JavaFileObject> d : diags.getDiagnostics()) {
                    if (d.getKind() == Diagnostic.Kind.ERROR) {
                        boolean inStudent = d.getSource() != null && d.getSource().getName().endsWith("Solution.java");
                        finish("compile_error", null, d.getMessage(null), inStudent ? (int) d.getLineNumber() : null);
                    }
                }
                finish("compile_error", null, "The code did not compile.", null);
            }
        }

        Thread watchdog = new Thread(() -> {
            try { Thread.sleep(seconds * 1000); } catch (InterruptedException e) { return; }
            finish("time_limit", null, "Stopped after " + seconds + " seconds. Look for a loop that never ends, or try a smaller test case.", null);
        });
        watchdog.setDaemon(true);
        watchdog.start();

        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> args = connector.defaultArguments();
        args.get("main").setValue("Main");
        args.get("options").setValue("-cp " + WORK + "/out:/opt/vizdsa/support -Xmx128m -Xss1m -Xshare:auto -XX:TieredStopAtLevel=1");
        VirtualMachine vm = connector.launch(args);
        child = vm.process();
        drain(child.getInputStream());
        drain(child.getErrorStream());
        EventRequestManager erm = vm.eventRequestManager();

        ExceptionRequest er = erm.createExceptionRequest(null, false, true);
        er.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        er.enable();
        MethodExitRequest exit = erm.createMethodExitRequest();
        for (String ex : new String[] {"java.*", "jdk.*", "sun.*", "com.sun.*", "VizSupport", "ListNode", "TreeNode", "Main"}) exit.addClassExclusionFilter(ex);
        exit.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        exit.enable();
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter("Main");
        cpr.enable();

        boolean started = false, stepSet = false, failed = false;
        EventQueue queue = vm.eventQueue();
        try {
            while (true) {
                EventSet set = queue.remove();
                for (Event ev : set) {
                    if (ev instanceof VMDeathEvent || ev instanceof VMDisconnectEvent) {
                        throw new VMDisconnectedException();
                    } else if (ev instanceof ClassPrepareEvent cp && !stepSet) {
                        StepRequest sr = erm.createStepRequest(cp.thread(), StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                        for (String ex : new String[] {"java.*", "jdk.*", "sun.*", "com.sun.*", "VizSupport", "ListNode", "TreeNode"}) sr.addClassExclusionFilter(ex);
                        sr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        sr.enable();
                        stepSet = true;
                    } else if (ev instanceof MethodExitEvent me) {
                        if (started && !mirror.isEmpty() && isStudent(me.location()) && me.method().name().equals(mirror.get(mirror.size() - 1).method)) {
                            mirror.get(mirror.size() - 1).returnJson = value(me.returnValue(), new ArrayDeque<>());
                        }
                    } else if (ev instanceof ExceptionEvent ee) {
                        ObjectReference ex = ee.exception();
                        Value detail = get(ex, "detailMessage");
                        String name = simple(ex.referenceType().name());
                        String message = detail instanceof StringReference s ? name + ": " + s.value() : name;
                        if (started && !mirror.isEmpty()) {
                            List<StackFrame> frames = studentFrames(ee.thread());
                            int line = frames.isEmpty() ? ee.location().lineNumber() : frames.get(frames.size() - 1).location().lineNumber();
                            emit("exception", mirror.get(mirror.size() - 1), line, null, null, message);
                            finish("runtime_error", null, message, line);
                        }
                        finish("runtime_error", null, message, null);
                    } else if (ev instanceof StepEvent se) {
                        Location loc = se.location();
                        if (!isStudent(loc)) {
                            if (started && loc.declaringType().name().equals("Main")) {
                                syncFrames(List.of());
                                started = false;
                                for (StepRequest r : List.copyOf(erm.stepRequests())) erm.deleteEventRequest(r);
                                exit.disable();
                            }
                            continue;
                        }
                        if (!started) {
                            if (!loc.method().name().equals(target)) continue;
                            started = true;
                        }
                        List<StackFrame> frames = studentFrames(se.thread());
                        syncFrames(frames);
                        if (frames.isEmpty()) continue;
                        Rec top = mirror.get(mirror.size() - 1);
                        StackFrame frame = frames.get(frames.size() - 1);
                        emit("line", top, loc.lineNumber(), frame, null, null);
                    }
                }
                set.resume();
            }
        } catch (VMDisconnectedException e) {
            // Target finished; the result (if any) is on disk.
        }
        try { child.waitFor(); } catch (InterruptedException e) { /* finishing anyway */ }
        Path result = Path.of(WORK, "result.json");
        if (Files.exists(result)) finish("ok", Files.readString(result), null, null);
        finish("runtime_error", null, "The program ended without returning a result.", null);
    }

    static void drain(InputStream in) {
        Thread t = new Thread(() -> {
            try (Reader r = new InputStreamReader(in, StandardCharsets.UTF_8)) {
                char[] buf = new char[4096];
                int n;
                while ((n = r.read(buf)) > 0) {
                    synchronized (childOut) {
                        int room = (int) stdoutCap - childOut.length();
                        if (room > 0) childOut.append(buf, 0, Math.min(n, room));
                    }
                }
            } catch (IOException e) { /* target went away */ }
        });
        t.setDaemon(true);
        t.start();
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> cast(Object o) { return (Map<String, Object>) o; }

    // Loads the classes every run needs, so the archive built at image time makes startup faster.
    static void warmup() {
        Bootstrap.virtualMachineManager().defaultConnector();
        ToolProvider.getSystemJavaCompiler();
    }
}
