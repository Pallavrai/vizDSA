"""Compiles a LeetCode-style C++ solution, traces it with gdb and writes a vizDSA trace to stdout.

gdb can hang inside a single step, so this parent process enforces the time limit and
assembles the trace from the steps gdb has already written to disk.
"""
import json, os, re, signal, subprocess, sys

WORK = "/tmp/w"


def emit(status, result=None, error=None, stdout="", steps_file=None):
    out = sys.stdout
    head = {"version": 1, "language": "cpp", "status": status, "result": result, "error": error, "stdout": stdout}
    out.write(json.dumps(head)[:-1] + ',"steps":[')
    if steps_file and os.path.exists(steps_file):
        with open(steps_file) as f:
            first = True
            for line in f:
                line = line.strip()
                if not line.endswith("}"):
                    continue  # a line cut off when gdb was killed
                out.write(("" if first else ",") + line)
                first = False
    out.write("]}")
    out.flush()
    sys.exit(0)


def main():
    payload = json.load(sys.stdin)
    code, driver, limits = payload["code"], payload["driver"], payload["limits"]
    os.makedirs(WORK, exist_ok=True)
    with open(WORK + "/main.cpp", "w") as f:
        f.write('#include <bits/stdc++.h>\n#include "support.h"\n#line 1 "solution.cpp"\n' + code + '\n#line 1 "driver.cpp"\n' + driver["main"])
    compiled = subprocess.run(
        ["g++", "-std=c++17", "-g", "-O0", "-fno-omit-frame-pointer", "-I/opt/pch", "-I/opt/vizdsa", "-Winvalid-pch", "main.cpp", "-o", "a.out"],
        cwd=WORK, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=25,
    )
    if compiled.returncode != 0:
        m = re.search(r"solution\.cpp:(\d+):\d+: (?:fatal )?error: (.*)", compiled.stderr)
        if m:
            emit("compile_error", error={"message": m.group(2), "line": int(m.group(1))})
        first = re.search(r"error: (.*)", compiled.stderr)
        emit("compile_error", error={"message": first.group(1) if first else "The code did not compile."})

    env = dict(os.environ, VIZDSA_METHOD=driver["method"], VIZDSA_LIMITS=json.dumps(limits))
    gdb = subprocess.Popen(
        ["gdb", "-q", "-nx", "-batch", "-x", "/opt/vizdsa/gdb_tracer.py", WORK + "/a.out"],
        cwd=WORK, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    timed_out = False
    try:
        gdb.wait(timeout=limits["seconds"])
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(gdb.pid, signal.SIGKILL)
        gdb.wait()

    stdout = ""
    if os.path.exists(WORK + "/stdout.txt"):
        with open(WORK + "/stdout.txt", errors="replace") as f:
            stdout = f.read(limits["stdoutBytes"])
    steps = WORK + "/steps.ndjson"
    if timed_out:
        emit("time_limit", error={"message": "Stopped after %d seconds. Look for a loop that never ends, or try a smaller test case." % limits["seconds"]}, stdout=stdout, steps_file=steps)
    meta = {}
    if os.path.exists(WORK + "/meta.json"):
        with open(WORK + "/meta.json") as f:
            meta = json.load(f)
    if meta.get("status") and meta["status"] != "ok":
        emit(meta["status"], error=meta.get("error"), stdout=stdout, steps_file=steps)
    if os.path.exists(WORK + "/result.json"):
        with open(WORK + "/result.json") as f:
            emit("ok", result=json.load(f), stdout=stdout, steps_file=steps)
    emit("runtime_error", error={"message": "The program ended without returning a result."}, stdout=stdout, steps_file=steps)


main()
