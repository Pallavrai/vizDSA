# Milestone 1 experiments

Author: Pallav Rai. Run on 2026-11-02 on an Apple Silicon Mac (arm64) with Docker Desktop.

**Limit of these results:** gVisor could not be installed into Docker Desktop without changing its settings, so it
ran nested, as `runsc do` inside a privileged container. A real x86_64 Linux VM may behave differently. Repeat
experiment 1 on the real VM before enabling C++ there.

## 1. gdb inside gVisor

**Method:** ran `gdb` stepping a small C++ DP program under `runsc` (release-20250106), on the default platform and
on `--platform=ptrace`, with dynamic and static builds, with ASLR control off.

**Result: did not work.** The program crashes with SIGSEGV in the dynamic loader (`_dl_runtime_resolve`) before
`main`. The static build fails too ("Cannot locate block for frame").

**Same test under plain Docker (`runc`):** works, with no added capabilities, at about 0.3 ms per step.

**Decision:** C++ cannot use gVisor. Python and Java do. C++ uses a separate setting, `SANDBOX_RUNTIME_CPP`, and is
**refused unless it is set**, so it can never silently run with weaker isolation. Under `runc`, C++ still has no
network, a read-only file system, all capabilities dropped, no-new-privileges and resource limits, but it shares
the host kernel. That is a meaningfully weaker boundary for code from strangers.

Better options to try later if C++ goes public: a Firecracker microVM per run, or a Valgrind-based tracer.

## 2. Python and Java inside gVisor

**Method:** ran the real runner images and tracers on the coin change fixture under nested `runsc`.

**Result: both work** and return the same result and step counts as under `runc`, in about 1 second including
container start.

## 3. Run time

Measured through the API under `runc`, including container start, on the coin change fixture:

| Language | Time  | Steps |
|----------|-------|-------|
| Python   | 0.15 s | 122  |
| Java     | 0.85 s | 123  |
| C++      | 0.45 s | 125  |

All are well under the 5-second target. C++ needs a precompiled `bits/stdc++.h` for this: it is built into the image.
Java needs class-data sharing, also built into the image. Runs close to the step limit take longer: a 60×60 Python
grid DP with 7,145 steps took 5.4 seconds, because every step re-reads the whole table.

## 4. Rendering at the limit

**Method:** dragged across that 7,145-step run with a 60×60 table in Chrome, 300 positions, one per frame.

**Result:** frame gaps had a median of 16.7 ms, a p95 of 20 ms and a worst of 25 ms. This is `e2e/perf.spec.ts`.
It ran on a recent Mac, so a low-end student laptop remains unmeasured.

## Known limits found while building

*   **Same-line loops in Java and C++:** debuggers stop only when the line changes, so `while (true) { n = n + 1; }`
    with only one line in the loop records almost no steps. The time limit still ends it, with a clear message.
*   **C++ return values:** the call tree shows no return values for C++, because gdb does not report them on a step.
*   **C++ raw pointers:** pointers to `ListNode`, `TreeNode` and the student's own structs are followed. Others show
    as addresses, and a C array passed as a pointer shows as an address.
