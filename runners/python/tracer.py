"""Runs a LeetCode-style Python solution and writes a vizDSA trace to stdout.

Reads {code, driver, limits} as JSON on stdin. See packages/trace for the format.
"""
import bisect, collections, functools, heapq, io, itertools, json, math, os, re, signal, string, sys, time, traceback, typing

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leetcode_types import ListNode, TreeNode

FILENAME = "solution.py"
MAX_ITEMS = 2000
MAX_OBJECTS = 5000
MAX_STR = 500


class CappedStdout(io.StringIO):
    def __init__(self, cap):
        super().__init__()
        self.cap = cap

    def write(self, s):
        room = self.cap - self.tell()
        if room > 0:
            super().write(s[:room])
        return len(s)


class Tracer:
    def __init__(self, out_fd, limits, stdout):
        self.out_fd = out_fd
        self.limits = limits
        self.stdout = stdout
        self.steps = []
        self.size = 0
        self.stack = []
        self.frame_ids = {}
        self.next_frame = 1
        self.snapshots = {}
        self.obj_ids = {}
        self.keep = []  # keeps objects alive so id() is never reused during a run
        self.heap_seen = {}

    def finish(self, status, result=None, error=None):
        sys.settrace(None)
        signal.setitimer(signal.ITIMER_REAL, 0)
        data = json.dumps({
            "version": 1, "language": "python", "status": status, "result": result,
            "error": error, "stdout": self.stdout.getvalue(), "steps": self.steps,
        }, separators=(",", ":"))
        with os.fdopen(self.out_fd, "w") as out:
            out.write(data)
        os._exit(0)

    def object_id(self, obj):
        key = id(obj)
        found = self.obj_ids.get(key)
        if found is None:
            found = "o%d" % (len(self.obj_ids) + 1)
            self.obj_ids[key] = found
            self.keep.append(obj)
        return found

    def value(self, v, queue):
        if v is None or isinstance(v, bool):
            return v
        if isinstance(v, int):
            return v if abs(v) <= 2**53 else {"text": str(v)}
        if isinstance(v, float):
            return v if math.isfinite(v) else {"text": str(v)}
        if isinstance(v, str):
            return v if len(v) <= MAX_STR else v[:MAX_STR] + "..."
        if isinstance(v, (list, tuple, dict, set, frozenset, collections.deque)) or hasattr(v, "__dict__") and not callable(v) and not isinstance(v, type(os)):
            oid = self.object_id(v)
            queue.append((oid, v))
            return {"ref": oid}
        return {"text": "<%s>" % type(v).__name__}

    def heap_object(self, oid, v, queue):
        truncated = False
        if isinstance(v, dict):
            kind = "map"
            items = list(itertools.islice(v.items(), MAX_ITEMS))
            truncated = len(v) > MAX_ITEMS
            contents = [[self.value(k, queue), self.value(x, queue)] for k, x in items]
        elif isinstance(v, (list, tuple, set, frozenset, collections.deque)):
            kind = "set" if isinstance(v, (set, frozenset)) else "queue" if isinstance(v, collections.deque) else "list"
            items = list(itertools.islice(v, MAX_ITEMS))
            truncated = len(v) > MAX_ITEMS
            contents = [self.value(x, queue) for x in items]
        else:
            kind = "object"
            contents = {k: self.value(x, queue) for k, x in vars(v).items()}
        obj = {"id": oid, "kind": kind, "typeName": type(v).__name__, "contents": contents}
        if truncated:
            obj["truncated"] = True
        return obj

    def emit(self, event, frame, return_value=None, has_return=False, message=None):
        limits = self.limits
        if len(self.steps) >= limits["steps"]:
            self.finish("step_limit", error={"message": "Stopped after %d steps. Try a smaller test case, or look for a loop that never ends." % limits["steps"], "line": frame.f_lineno})
        queue = []
        fid = self.frame_ids[frame]
        snap = self.snapshots.setdefault(fid, {})
        current = {}
        for name, v in frame.f_locals.items():
            if name.startswith("__") or callable(v) or isinstance(v, type(os)):
                continue
            if name == "self" and isinstance(v, object) and hasattr(v, "__dict__") and not vars(v):
                continue
            current[name] = self.value(v, queue)
        changes = [{"name": n, "value": x} for n, x in current.items() if n not in snap or snap[n] != x]
        changes += [{"name": n} for n in snap if n not in current]
        self.snapshots[fid] = current
        # Objects reachable from any live frame may have changed, not just the current one's.
        for other in self.stack:
            if other is frame:
                continue
            for name, v in other.f_locals.items():
                if isinstance(v, (list, tuple, dict, set, frozenset, collections.deque)) or (hasattr(v, "__dict__") and not callable(v) and not isinstance(v, type(os))):
                    queue.append((self.object_id(v), v))
        heap_changes = []
        seen = set()
        while queue and len(seen) < MAX_OBJECTS:
            oid, v = queue.pop()
            if oid in seen:
                continue
            seen.add(oid)
            obj = self.heap_object(oid, v, queue)
            text = json.dumps(obj, separators=(",", ":"))
            if self.heap_seen.get(oid) != text:
                self.heap_seen[oid] = text
                heap_changes.append(obj)
        step = {"event": event, "line": frame.f_lineno, "frameId": fid, "functionName": frame.f_code.co_name, "frameChanges": changes, "heapChanges": heap_changes}
        if has_return:
            step["returnValue"] = self.value(return_value, [])
        if message:
            step["message"] = message
        self.size += len(json.dumps(step, separators=(",", ":")))
        if self.size > limits["traceBytes"]:
            self.finish("step_limit", error={"message": "Stopped because the recording grew too large. Try a smaller test case.", "line": frame.f_lineno})
        self.steps.append(step)

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != FILENAME:
            return None
        if event == "call":
            self.frame_ids[frame] = self.next_frame
            self.next_frame += 1
            self.stack.append(frame)
            self.emit("call", frame)
        elif event == "line":
            self.emit("line", frame)
        elif event == "exception":
            self.emit("exception", frame, message="%s: %s" % (arg[0].__name__, arg[1]))
        elif event == "return":
            self.emit("return", frame, arg, True)
            self.stack.pop()
        return self.trace


def to_json(v, depth=0):
    if depth > 50:
        return "..."
    if isinstance(v, float) and not math.isfinite(v):
        return str(v)
    if isinstance(v, ListNode):
        out, seen = [], set()
        while v is not None and id(v) not in seen and len(out) < MAX_ITEMS:
            seen.add(id(v))
            out.append(to_json(v.val, depth + 1))
            v = v.next
        return out
    if isinstance(v, TreeNode):
        out, q = [], collections.deque([v])
        while q and len(out) < MAX_ITEMS:
            n = q.popleft()
            if n is None:
                out.append(None)
            else:
                out.append(to_json(n.val, depth + 1))
                q.extend([n.left, n.right])
        while out and out[-1] is None:
            out.pop()
        return out
    if isinstance(v, dict):
        return {str(k): to_json(x, depth + 1) for k, x in v.items()}
    if isinstance(v, (list, tuple, set, frozenset, collections.deque)):
        return [to_json(x, depth + 1) for x in v]
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(type(v).__name__)


def build_list(values):
    head = tail = None
    for x in values:
        node = ListNode(x)
        if tail:
            tail.next = node
        else:
            head = node
        tail = node
    return head


def build_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q, i = collections.deque([root]), 1
    while q and i < len(values):
        n = q.popleft()
        if i < len(values) and values[i] is not None:
            n.left = TreeNode(values[i])
            q.append(n.left)
        i += 1
        if i < len(values) and values[i] is not None:
            n.right = TreeNode(values[i])
            q.append(n.right)
        i += 1
    return root


def convert(arg):
    if arg.get("convert") == "list":
        return build_list(arg["value"])
    if arg.get("convert") == "tree":
        return build_tree(arg["value"])
    return arg["value"]


def student_line(tb):
    line = None
    for frame, lineno in traceback.walk_tb(tb):
        if frame.f_code.co_filename == FILENAME:
            line = lineno
    return line


def main():
    payload = json.load(sys.stdin)
    code, driver, limits = payload["code"], payload["driver"], payload["limits"]
    # Keep the real stdout for the trace; student prints and fd writes must not reach it.
    out_fd = os.dup(1)
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 1)
    stdout = CappedStdout(limits["stdoutBytes"])
    sys.stdout = stdout
    tracer = Tracer(out_fd, limits, stdout)

    try:
        compiled = compile(code, FILENAME, "exec")
    except SyntaxError as e:
        tracer.finish("compile_error", error={"message": "%s: %s" % (type(e).__name__, e.msg), "line": e.lineno})

    ns = {"__name__": "__main__", "ListNode": ListNode, "TreeNode": TreeNode}
    for mod in (collections, heapq, itertools, functools, math, bisect, string, re):
        ns[mod.__name__] = mod
    ns.update({k: getattr(typing, k) for k in typing.__all__})
    ns.update({k: getattr(collections, k) for k in collections.__all__})
    ns.update({"heappush": heapq.heappush, "heappop": heapq.heappop, "heapify": heapq.heapify, "lru_cache": functools.lru_cache, "cache": functools.cache, "inf": math.inf})

    def on_timeout(_sig, _frame):
        tracer.finish("time_limit", error={"message": "Stopped after %d seconds. Look for a loop that never ends, or try a smaller test case." % limits["seconds"]})

    signal.signal(signal.SIGALRM, on_timeout)
    signal.setitimer(signal.ITIMER_REAL, limits["seconds"])
    sys.setrecursionlimit(1500)

    try:
        exec(compiled, ns)
        method = getattr(ns["Solution"](), driver["method"])
        args = [convert(a) for a in driver["args"]]
    except BaseException as e:
        tracer.finish("runtime_error", error={"message": "%s: %s" % (type(e).__name__, e), "line": student_line(e.__traceback__)})

    try:
        sys.settrace(tracer.trace)
        result = method(*args)
        sys.settrace(None)
    except BaseException as e:
        sys.settrace(None)
        tracer.finish("runtime_error", error={"message": "%s: %s" % (type(e).__name__, e), "line": student_line(e.__traceback__)})

    if driver.get("returnsVoid") and args:
        result = args[0]
    tracer.finish("ok", result=to_json(result))


main()
