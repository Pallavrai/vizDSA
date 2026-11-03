"""Runs inside gdb. Steps through the student's code and appends trace steps to disk."""
import itertools, json, math, os, re, sys, time
import gdb

sys.path.insert(0, "/usr/share/gcc/python")
try:
    from libstdcxx.v6.printers import register_libstdcxx_printers
    register_libstdcxx_printers(None)
except ImportError:
    pass  # containers then show as plain structs

WORK = "/tmp/w"
SOURCE = "solution.cpp"
METHOD = os.environ["VIZDSA_METHOD"]
LIMITS = json.loads(os.environ["VIZDSA_LIMITS"])
MAX_ITEMS = 2000
MAX_OBJECTS = 5000

steps_file = open(WORK + "/steps.ndjson", "w")
step_count = 0
size = 0
next_frame = 1
heap_seen = {}
signal_name = None
exited = False


class Rec:
    def __init__(self, frame):
        global next_frame
        self.frame = frame
        self.id = next_frame
        next_frame += 1
        self.name = frame.name() or "?"
        self.name = self.name.split("(")[0].split("::")[-1]
        self.snapshot = {}
        self.shown = set()
        self.roots = []


mirror = []


def meta(status, error=None):
    with open(WORK + "/meta.json", "w") as f:
        json.dump({"status": status, "error": error}, f)
    steps_file.flush()
    gdb.execute("kill", to_string=True)
    os._exit(0)


def is_student(frame):
    sal = frame.find_sal()
    return sal.symtab is not None and sal.symtab.filename.endswith(SOURCE)


def obj_id(v, fallback=None):
    addr = v.address
    if addr is None:
        return fallback or "c%x" % (id(v))
    return "c%x:%s" % (int(addr), v.type.strip_typedefs().name or "t")


def struct_name(t):
    return t.strip_typedefs().name or ""


CONTAINERS = [
    (r"^std::(__cxx11::)?(list|forward_list)<", "list"),
    (r"^std::vector<", "list"), (r"^std::array<", "list"), (r"^std::deque<", "queue"),
    (r"^std::(unordered_)?(multi)?map<", "map"), (r"^std::(unordered_)?(multi)?set<", "set"),
    (r"^std::stack<", "stack"), (r"^std::queue<", "queue"), (r"^std::priority_queue<", "list"),
]


def value(v, queue, fallback=None):
    t = v.type.strip_typedefs()
    code = t.code
    if code in (gdb.TYPE_CODE_REF, gdb.TYPE_CODE_RVALUE_REF):
        return value(v.referenced_value(), queue, fallback)
    if code == gdb.TYPE_CODE_BOOL:
        return bool(v)
    if code == gdb.TYPE_CODE_CHAR or (code == gdb.TYPE_CODE_INT and t.sizeof == 1):
        n = int(v) & 0xff
        return chr(n) if 32 <= n < 127 else n
    if code in (gdb.TYPE_CODE_INT, gdb.TYPE_CODE_ENUM):
        n = int(v)
        return n if abs(n) <= 2**53 else {"text": str(n)}
    if code == gdb.TYPE_CODE_FLT:
        f = float(v)
        return f if math.isfinite(f) else {"text": str(f)}
    if code == gdb.TYPE_CODE_PTR:
        n = int(v)
        if n == 0:
            return None
        target = t.target().strip_typedefs()
        if target.code == gdb.TYPE_CODE_STRUCT and not struct_name(target).startswith("std::"):
            try:
                pointee = v.dereference()
                pointee.fetch_lazy()
            except gdb.MemoryError:
                return {"text": "<invalid pointer>"}
            oid = obj_id(pointee)
            queue.append((oid, pointee))
            return {"ref": oid}
        return {"text": hex(n)}
    if code == gdb.TYPE_CODE_ARRAY or code == gdb.TYPE_CODE_STRUCT:
        name = struct_name(t)
        if re.match(r"^std::(__cxx11::)?basic_string<", name):
            return v["_M_dataplus"]["_M_p"].string(length=min(int(v["_M_string_length"]), 500))
        oid = obj_id(v, fallback)
        queue.append((oid, v))
        return {"ref": oid}
    return {"text": "<%s>" % str(t)}


def heap_object(oid, v, queue):
    t = v.type.strip_typedefs()
    name = struct_name(t)
    if t.code == gdb.TYPE_CODE_ARRAY:
        low, high = t.range()
        count = high - low + 1
        items = [value(v[i], queue, "%s[%d]" % (oid, i)) for i in range(low, min(high + 1, low + MAX_ITEMS))]
        obj = {"id": oid, "kind": "list", "typeName": "array", "contents": items}
        if count > MAX_ITEMS:
            obj["truncated"] = True
        return obj
    kind = None
    for pattern, k in CONTAINERS:
        if re.match(pattern, name):
            kind = k
            break
    if kind:
        vis = gdb.default_visualizer(v)
        if vis is not None and hasattr(vis, "children"):
            children = vis.children()
            limit = MAX_ITEMS * 2 if kind == "map" else MAX_ITEMS
            taken = list(itertools.islice(children, limit + 1))
            truncated = len(taken) > limit
            taken = taken[:limit]
            raw = [value(c[1] if isinstance(c, tuple) else c, queue, "%s[%d]" % (oid, i)) for i, c in enumerate(taken)]
            contents = [[raw[i], raw[i + 1]] for i in range(0, len(raw) - 1, 2)] if kind == "map" else raw
            obj = {"id": oid, "kind": kind, "typeName": name.split("<")[0].replace("std::", ""), "contents": contents}
            if truncated:
                obj["truncated"] = True
            return obj
    if name.startswith("std::pair<"):
        return {"id": oid, "kind": "list", "typeName": "pair", "contents": [value(v["first"], queue, oid + ".first"), value(v["second"], queue, oid + ".second")]}
    if name.startswith("std::"):
        return {"id": oid, "kind": "object", "typeName": name.split("<")[0].replace("std::", ""), "contents": {}}
    fields = {}
    for f in t.fields():
        if f.is_base_class or not hasattr(f, "bitpos") or f.name is None:
            continue
        fields[f.name] = value(v[f.name], queue, oid + "." + f.name)
    return {"id": oid, "kind": "object", "typeName": name, "contents": fields}


def frame_vars(frame, rec, line):
    out = {}
    queue = []
    try:
        block = frame.block()
    except RuntimeError:
        return out, queue
    while block is not None:
        for sym in block:
            if not (sym.is_variable or sym.is_argument) or sym.name in out or sym.name.startswith("__"):
                continue
            # Later declarations are uninitialized memory. Hide them until execution passes the line.
            if not sym.is_argument and sym.line and (sym.line > line or (sym.line == line and sym.name not in rec.shown)):
                continue
            try:
                v = sym.value(frame)
                if sym.name == "this":
                    target = v.dereference()
                    if not any(hasattr(f, "bitpos") and f.name for f in target.type.strip_typedefs().fields()):
                        continue
                out[sym.name] = value(v, queue, sym.name)
                rec.shown.add(sym.name)
            except (gdb.error, gdb.MemoryError, RuntimeError):
                pass
        if block.function:
            break
        block = block.superblock
    return out, queue


def write_step(step):
    global step_count, size
    text = json.dumps(step, separators=(",", ":"))
    size += len(text)
    if size > LIMITS["traceBytes"]:
        meta("step_limit", {"message": "Stopped because the recording grew too large. Try a smaller test case.", "line": step["line"]})
    steps_file.write(text + "\n")
    step_count += 1


def emit(event, rec, line, frame=None, message=None):
    if step_count >= LIMITS["steps"]:
        meta("step_limit", {"message": "Stopped after %d steps. Try a smaller test case, or look for a loop that never ends." % LIMITS["steps"], "line": line})
    changes = []
    queue = []
    if frame is not None:
        current, queue = frame_vars(frame, rec, line)
        changes = [{"name": n, "value": x} for n, x in current.items() if n not in rec.snapshot or rec.snapshot[n] != x]
        changes += [{"name": n} for n in rec.snapshot if n not in current]
        rec.snapshot = current
        # Addresses, not gdb values: a value holds a copy of memory from the step it was read on.
        rec.roots = [(oid, v.type, int(v.address)) for oid, v in queue if v.address is not None]
    for other in mirror:
        if other is not rec:
            for oid, value_type, address in other.roots:
                queue.append((oid, gdb.Value(address).cast(value_type.pointer()).dereference()))
    heap_changes = []
    seen = set()
    while queue and len(seen) < MAX_OBJECTS:
        oid, v = queue.pop()
        if oid in seen:
            continue
        seen.add(oid)
        try:
            obj = heap_object(oid, v, queue)
        except (gdb.error, gdb.MemoryError, RuntimeError):
            continue
        text = json.dumps(obj, sort_keys=True)
        if heap_seen.get(oid) != text:
            heap_seen[oid] = text
            heap_changes.append(obj)
    step = {"event": event, "line": line, "frameId": rec.id, "functionName": rec.name, "frameChanges": changes, "heapChanges": heap_changes}
    if message:
        step["message"] = message
    write_step(step)


def on_stop(event):
    global signal_name
    if isinstance(event, gdb.SignalEvent) and event.stop_signal not in ("SIGTRAP",):
        signal_name = event.stop_signal


def on_exit(_event):
    global exited
    exited = True


SIGNAL_TEXT = {
    "SIGSEGV": "Segmentation fault: the code read or wrote memory it should not, such as a bad index or a null pointer, or recursed too deeply.",
    "SIGABRT": "The program aborted, usually from an uncaught exception.",
    "SIGFPE": "Arithmetic error, usually division by zero.",
}


entry_pcs = {}


def at_function_entry(frame):
    function = frame.function()
    return function is not None and entry_pcs.get(function.print_name) == frame.pc()


def sync_stack(newest):
    while mirror and not mirror[-1].frame.is_valid():
        rec = mirror.pop()
        emit("return", rec, rec_line(newest))
    # In fib(n-1) + fib(n-2), one `step` leaves the first call and enters the second at the
    # same stack address, so gdb sees one frame. Being back at the function's entry means a new call.
    # shortcut: a loop jumping back to the exact entry instruction would split the frame; not seen with g++ -O0.
    if mirror and newest == mirror[-1].frame and is_student(newest) and at_function_entry(newest):
        rec = mirror.pop()
        emit("return", rec, rec_line(newest))
    new = []
    f = newest
    while f is not None and (not mirror or f != mirror[-1].frame):
        if is_student(f):
            new.append(f)
        if f.name() == "main":
            break
        f = f.older()
    for frame in reversed(new):
        # Where `step` stops on entering a function, after its prologue. Only the newest frame has just entered.
        if frame == newest and frame.function() is not None:
            entry_pcs.setdefault(frame.function().print_name, frame.pc())
        rec = Rec(frame)
        mirror.append(rec)
        emit("call", rec, frame.find_sal().line, frame)


def rec_line(frame):
    f = frame
    while f is not None and not is_student(f):
        f = f.older()
    return f.find_sal().line if f is not None else 0


def main():
    gdb.events.stop.connect(on_stop)
    gdb.events.exited.connect(on_exit)
    for cmd in ["set pagination off", "set confirm off", "set style enabled off", "set disable-randomization off", "set print elements 0", "skip -rfu ^std::", "skip -rfu ^__gnu_cxx::", "skip -rfu ^viz"]:
        gdb.execute(cmd, to_string=True)
    gdb.execute("rbreak ^Solution::%s(" % METHOD, to_string=True)
    gdb.execute("run > %s/stdout.txt 2>&1 < /dev/null" % WORK, to_string=True)
    if exited:
        return
    gdb.execute("delete", to_string=True)

    newest = gdb.newest_frame()
    sync_stack(newest)
    emit("line", mirror[-1], newest.find_sal().line, newest)
    while True:
        try:
            gdb.execute("step", to_string=True)
        except gdb.error:
            pass
        if exited:
            return
        newest = gdb.newest_frame()
        if signal_name:
            line = rec_line(newest)
            message = SIGNAL_TEXT.get(signal_name, "The program stopped with signal %s." % signal_name)
            if mirror:
                emit("exception", mirror[-1], line, message=message)
            meta("runtime_error", {"message": message, "line": line})
        # Library code we could not skip: run back out to the student's code.
        while not is_student(newest) and newest.name() != "main":
            try:
                gdb.execute("finish", to_string=True)
            except gdb.error:
                break
            if exited:
                return
            if signal_name:
                break
            newest = gdb.newest_frame()
        if signal_name:
            continue
        if newest.name() == "main":
            sync_stack(newest)
            if not mirror:
                steps_file.flush()
                gdb.execute("continue", to_string=True)
                return
            continue
        sync_stack(newest)
        emit("line", mirror[-1], newest.find_sal().line, newest)


main()
steps_file.flush()
