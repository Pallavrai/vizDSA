import java.lang.reflect.Array;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

public class VizSupport {
    @SafeVarargs
    public static <T> ArrayList<T> list(T... items) {
        return new ArrayList<>(Arrays.asList(items));
    }

    public static ListNode listNode(Integer[] values) {
        ListNode dummy = new ListNode();
        ListNode tail = dummy;
        for (Integer v : values) {
            tail.next = new ListNode(v);
            tail = tail.next;
        }
        return dummy.next;
    }

    public static TreeNode tree(Integer[] values) {
        if (values.length == 0 || values[0] == null) return null;
        TreeNode root = new TreeNode(values[0]);
        ArrayDeque<TreeNode> queue = new ArrayDeque<>();
        queue.add(root);
        int i = 1;
        while (!queue.isEmpty() && i < values.length) {
            TreeNode n = queue.poll();
            if (i < values.length && values[i] != null) { n.left = new TreeNode(values[i]); queue.add(n.left); }
            i++;
            if (i < values.length && values[i] != null) { n.right = new TreeNode(values[i]); queue.add(n.right); }
            i++;
        }
        return root;
    }

    public static void report(Object value) throws Exception {
        StringBuilder out = new StringBuilder();
        write(out, value);
        Files.writeString(Path.of("/tmp/w/result.json"), out.toString());
    }

    private static void writeString(StringBuilder out, String s) {
        out.append('"');
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 32) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        out.append('"');
    }

    private static void write(StringBuilder out, Object v) {
        if (v == null) {
            out.append("null");
        } else if (v instanceof Boolean || v instanceof Integer || v instanceof Long || v instanceof Short || v instanceof Byte) {
            out.append(v);
        } else if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isFinite(d)) out.append(d); else writeString(out, String.valueOf(d));
        } else if (v instanceof String || v instanceof Character) {
            writeString(out, v.toString());
        } else if (v.getClass().isArray()) {
            out.append('[');
            for (int i = 0; i < Array.getLength(v); i++) {
                if (i > 0) out.append(',');
                write(out, Array.get(v, i));
            }
            out.append(']');
        } else if (v instanceof Collection<?> c) {
            out.append('[');
            boolean first = true;
            for (Object x : c) {
                if (!first) out.append(',');
                first = false;
                write(out, x);
            }
            out.append(']');
        } else if (v instanceof Map<?, ?> m) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) out.append(',');
                first = false;
                writeString(out, String.valueOf(e.getKey()));
                out.append(':');
                write(out, e.getValue());
            }
            out.append('}');
        } else if (v instanceof ListNode n) {
            List<Object> values = new ArrayList<>();
            IdentityHashMap<ListNode, Boolean> seen = new IdentityHashMap<>();
            while (n != null && seen.put(n, true) == null && values.size() < 2000) { values.add(n.val); n = n.next; }
            write(out, values);
        } else if (v instanceof TreeNode t) {
            List<Object> values = new ArrayList<>();
            ArrayList<TreeNode> queue = new ArrayList<>();
            queue.add(t);
            for (int i = 0; i < queue.size() && values.size() < 2000; i++) {
                TreeNode n = queue.get(i);
                if (n == null) { values.add(null); continue; }
                values.add(n.val);
                queue.add(n.left);
                queue.add(n.right);
            }
            while (!values.isEmpty() && values.get(values.size() - 1) == null) values.remove(values.size() - 1);
            write(out, values);
        } else {
            writeString(out, v.getClass().getSimpleName());
        }
    }
}
