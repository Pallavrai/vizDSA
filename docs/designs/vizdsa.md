# vizDSA: Step Through Your Own DSA Code Visually

*   **Author:** Pallav Rai
*   **Status:** Implemented
*   **Date:** 2026-11-02

--------------------------------------------------------------------------------

## Overview

vizDSA is a web tool for college students who are learning data structures and
algorithms. A student pastes their own LeetCode-style solution in Python, Java
or C++, adds test cases, and runs it. The tool records every step of the run and
draws it: arrays with their pointers, hash map buckets, stacks and queues, linked
lists, trees, recursion calls and dynamic programming (DP) tables. The student
can play, pause, and move forwards and backwards through the run while the
matching line of their code is highlighted.

Dynamic programming gets the most depth, because it is where new students most
often get stuck and where a text debugger helps least.

The first release is a personal and portfolio project on one small server. It is
not built for public traffic, but its link is public, so anyone may submit code.

## The Problem

New students usually debug DSA code in one of three ways, and each fails them in
a specific way:

*   **Print statements and text debuggers** show one value at a time. A DP bug is
    usually a pattern across a whole table, such as a wrong value spreading from
    one bad cell. That pattern is hard to see in a list of numbers.
*   **Algorithm visualizer sites** animate a correct, prebuilt algorithm. They
    teach the idea, but cannot answer the question the student actually has: "why
    does *my* code give the wrong answer on *this* test case?"
*   **LeetCode itself** reports the failing input and the wrong output, then stops.
    It shows nothing about how the code reached that output.

The proposed solution is to run the student's real code against their real test
case and turn the recording into visuals they can move through at their own pace.

## Goals

1.  **Run real code.** A student can paste a LeetCode-style `Solution` class,
    unchanged, in Python, Java or C++ and run it. Delivery order is Python, then
    Java, then C++.
2.  **Accept LeetCode test cases.** A student can paste a test case in LeetCode's
    format (one parameter per line, such as `[2,7,11,15]` then `9`) or write their
    own. They can run several test cases and optionally give an expected output
    for each one, which produces a pass or fail result.
3.  **Move freely through a run.** Play, pause, step forward, step back, change
    speed, and drag along a timeline to any step. The current line of code is
    highlighted at every step.
4.  **Draw data structures automatically.** Without the student adding anything to
    their code, the tool draws arrays with index pointers such as `i` and `j`, hash
    maps as buckets, stacks, queues, LeetCode's `ListNode` lists, `TreeNode` trees,
    and the recursion call tree.
5.  **Make DP visible.** 1D and 2D DP tables fill in cell by cell. For each new
    value, the tool shows which earlier cells it was computed from. Memoized
    recursion shows the call tree and marks where a cached result was reused.
6.  **Let the student correct a wrong drawing.** When the tool picks the wrong
    view for a variable, the student can choose another view in one or two clicks.
7.  **Use motion to explain.** Every animation shows something that happened in the
    code, such as a value moving, a pointer advancing or a call returning. The tool
    should be visually distinctive and pleasant to use. It must also honour the
    browser's reduced-motion setting and stay readable with animation turned off.
8.  **Stay safe with bad or hostile code.** Infinite loops, runaway recursion and
    malicious code end in a clear message. They do not harm the server or other
    students.

**Targets for the first release:**

*   A first-time student gets from pasting code to seeing the first visual in under
    one minute.
*   A typical run returns its recording in under 5 seconds.
*   Stepping and scrubbing stay smooth for runs of up to 10,000 recorded steps.

## Non-Goals

*   **LeetCode integration.** No logging in to LeetCode, fetching problems or
    submitting answers. The student pastes what they need.
*   **Grading or generating expected answers.** The tool only compares against an
    expected output when the student supplies one.
*   **AI explanations or hints.** The tool shows what the code did, not what it
    should have done.
*   **A library of prebuilt algorithm animations.** The product is built around the
    student's own code.
*   **Accounts, saved history, classrooms or sharing** in the first release.
*   **A full online IDE.** The editor offers syntax highlighting and basic editing,
    without autocomplete, multi-file projects or package installs.
*   **Other languages,** and programs in these languages that rely on threads,
    network access, file access or reading from standard input.
*   **Editing on phones.** Pages should not break on a small screen, but the main
    experience is designed for a laptop.
*   **Using 3D for its own sake.** Tables, arrays and pointers stay flat because
    exact values must be readable. Three.js is used only on the landing page.

## Open Questions

*   **C++ isolation on a public server**: gdb did not work inside gVisor in testing (see
    [experiments](../experiments.md)), so C++ is refused unless `SANDBOX_RUNTIME_CPP` is set, and it then runs under
    `runc`, which shares the host kernel. Whether to enable that on a public server is undecided.
*   **C++ memory**: Raw pointers and arrays give the tracer less type information
    than Python or Java, so some C++ data may be drawn less well. How much of this
    is acceptable at release is undecided.
*   **Empty first screen**: Prebuilt examples were ruled out, but a new student with
    no code needs something to try. The implementation plan opens the editor on one
    short sample solution per language. Remove `samples.ts` if this is not wanted.
*   **Meaning of "pass" in the original request**: This draft reads it as pass/fail
    results for test cases, alongside pause and run controls. Please correct this if
    something else was meant.

## Critical User Journeys (CUJs)

### CUJ 1: Find a bug in a DP solution

*   **Given**: A student has a Coin Change solution in Python that returns the wrong
    answer on a test case.
*   **When**: They paste the code and test case, press Run, and drag the timeline
    while watching the DP table.
*   **Then**: The table fills in cell by cell, each new value shows the cells it came
    from, and the matching code line stays highlighted. The student can see the first
    cell that holds a wrong value and which line wrote it.

### CUJ 2: Check a solution against several test cases

*   **Given**: A student has a solution, three test cases and an expected output for
    each one.
*   **When**: They run all three.
*   **Then**: Each test case shows pass or fail along with the actual and expected
    output. Selecting a failed test case opens its recording.

### CUJ 3: Understand recursion with memoization

*   **Given**: A student has a recursive Fibonacci or Climbing Stairs solution with a
    memo dictionary.
*   **When**: They step through the run.
*   **Then**: The call tree grows and shrinks as calls are made and return, and calls
    answered from the memo are marked. The student can see how much work the memo
    saved.

### CUJ 4: Correct a wrong drawing

*   **Given**: The tool draws a 2D list as a DP table, but it is really a grid or an
    adjacency list.
*   **When**: The student opens the view menu on that variable and picks another view.
*   **Then**: The variable is redrawn straight away for all steps, without running the
    code again.

### CUJ 5: Run code that never finishes

*   **Given**: A student's `while` loop never ends.
*   **When**: They press Run.
*   **Then**: The run stops at the step or time limit with a plain message saying so.
    The steps recorded up to that point can still be explored, so the student can
    watch the loop failing to make progress.

### CUJ 6: Code that does not compile or crashes

*   **Given**: A student's code has a compile error or throws an exception partway
    through the run.
*   **When**: They press Run.
*   **Then**: A compile error appears next to the relevant line. For a crash, the
    recording stops at the failing line with the error message, and all earlier steps
    can be explored.

## Technical Plan (Architecture)

### Summary

The system has three parts. The **browser app** holds the editor, the visuals and
the playback controls. The **run API** accepts one piece of code and one test case,
then starts a sandbox. The **sandboxed tracer** for each language runs the code and
writes a recording, called a trace.

The main design rule is that all three tracers produce the same trace format.
Everything after the tracer, including deciding what to draw, happens in the
browser. Adding a language therefore needs no visual work, and changing the view of
a variable needs no second run (CUJ 4).

```text
 Browser (React app)                         Server (single VM)
 +--------------------------------+          +-------------------------------+
 | Code editor + test case panel  |  POST    | Run API                       |
 |                                | /runs    |  - validates size and rate    |
 |                                |--------->|  - limits concurrent runs     |
 |                                |          |  - starts one fresh sandbox   |
 | Trace store: state at any step |<---------|              |                |
 |   |                            |  trace   |              v                |
 |   +--> Read finder             |  (gzip)  | Sandbox (gVisor container)    |
 |   +--> View chooser            |          |  no network, capped resources |
 |   +--> Renderers + animations  |          |  Python: sys.settrace         |
 |                                |          |  Java:   JDI                  |
 | Timeline + playback controls   |          |  C++:    gdb Python API       |
 +--------------------------------+          +-------------------------------+
```

### Run API

The API has a single endpoint, and each request covers one test case:

```text
POST /runs
  request:  { language, code, testCaseInput }
  response: Trace
```

With several test cases, the browser sends one request per test case, at most two
at a time, and shows each result as it arrives (CUJ 2). This avoids separate "check"
and "trace" modes and keeps every request inside one set of limits. Java and C++ are
compiled again for each test case. That is wasteful but simple, and a compile cache
can be added if it turns out to matter. A student can add up to 6 test cases.

The API needs no database, because nothing is stored. Rate limits and the queue live
in the server's memory, which works because there is only one server. When the queue
is full, the API returns HTTP 429 and the browser shows a "busy, try again" message.

### Trace format

A trace is an ordered list of steps plus a shared record of objects. Each step
records only what changed, because full copies would be far too large across 10,000
steps. In the browser, the trace store rebuilds the full state every 100 steps and
caches it, so jumping to any step means replaying at most 99 changes.

```text
Trace {
  version, language
  status:      ok | compile_error | runtime_error | step_limit | time_limit
  result, error, stdout
  steps: [ Step ]
}
Step {
  event:  call | line | return | exception
  line, frameId, functionName
  frameChanges: [ { name, value } ]        // locals that changed
  heapChanges:  [ { id, kind, contents } ] // objects that changed
}
Value  = primitive | { ref: objectId }
kind   = list | map | set | stack | queue | object
```

Values are stored by reference to an object id, not copied. This means that when two
variables point at the same list, or a linked list has several pointers into it, the
drawing shows one object with several arrows. A beginner's aliasing bug is then
visible on screen.

### Tracers

Before starting a sandbox, the API finds the student's method in the `Solution` class,
parses the test case and generates a small language-specific driver. The tracer runs
that driver inside the sandbox, and the driver calls the method with the test case
values. The sandbox also provides LeetCode's standard `ListNode` and `TreeNode`
definitions, because LeetCode leaves them commented out in the student's code. The
driver builds these types from the pasted input.

The browser compares the result with any expected output the student gave, so expected
outputs never reach the server.

| Language | How it records                | Main concern                              |
|----------|-------------------------------|-------------------------------------------|
| Python   | `sys.settrace` line events    | Must record only the student's own code   |
| Java     | JDI stepping on a second JVM  | JVM start time counts against 5 seconds   |
| C++      | gdb Python API, `-g -O0`      | Must skip standard library code; speed    |

All three record the state *before* each line runs, as debuggers do. The effect of
a line therefore appears on the following step.

**Limits for each run:** 10,000 steps, 10 seconds of tracing after compiling, 256 MB
of memory (640 MB for Java and 512 MB for C++, which need it to compile and debug), 64 KB of printed output and a 20 MB trace. When a limit is reached, the
tracer returns the steps recorded so far and a status saying why it stopped (CUJ 5).

### Sandbox

Every run gets a new container using gVisor, which handles the code's system calls
in a separate user-space kernel so that a container escape is harder. Each container
has no network, a read-only file system with a small temporary folder, a non-root
user, and limits on CPU, memory and process count. The API deletes the container
after the run, and it kills any container that outlives its time limit.

**Change after testing:** gdb does not work under gVisor, so C++ cannot use it. C++ is refused unless
`SANDBOX_RUNTIME_CPP` is set, and it then runs under `runc` with the same limits but a shared host kernel. Python and
Java use gVisor. See [experiments](../experiments.md).

Student code is held only for the length of the run and is never written to logs.

### Read finder: how DP dependencies are found

Tracers report writes but not reads, and adding read tracking separately to each of
the three tracers would be expensive. Fortunately, `dp[i-1][j]` is written the same
way in Python, Java and C++. So one small browser module finds reads for all three:

1.  Take the source text of the current line.
2.  Find patterns of the form `name[expr]` or `name[expr][expr]`. Also recognise the
    common method forms `dp.get(i)` in Java and `dp.at(i)` in C++.
3.  Work out each index using the variable values at that step. The evaluator handles
    only integers, variable names and basic arithmetic. It does not run the student's
    code, so it has no side effects.
4.  Treat a target on the left of `=` as the write and everything else as a read. On
    the following step, the tool draws arrows from the read cells to the changed cell.

**Limit:** this is a best guess from one line of source. It will miss reads in a helper
function, a line split across several lines, or a list comprehension. In those cases
the cell still updates and simply has no arrows. A missing arrow is acceptable, but a
wrong one would mislead, so any index that cannot be fully worked out or is out of
range is dropped.

**Memo hits (CUJ 3):** a call is marked as a cache hit when it returns without making
any recursive call, and the read finder found a read from a map or array that was
written earlier in the run. Base cases usually read nothing from such a structure, so
they are not marked. This is also a best guess.

### View chooser

The browser picks a view for each variable, using the first rule that matches:

| What the trace shows                                  | View                       |
|-------------------------------------------------------|----------------------------|
| Object with `next`, or with `left` and `right`        | Linked list, or tree       |
| Java or C++ stack or queue, or Python `deque`         | Stack, or queue            |
| Rectangular 2D list of numbers changed during the run | 2D DP table                |
| Other 2D list                                         | Grid or adjacency list     |
| 1D list named `dp`, `memo` or similar, or filled by index | 1D DP table            |
| Python list changed only by `append` and `pop`        | Stack                      |
| Other 1D list                                         | Array                      |
| Map or dictionary                                     | Buckets                    |
| Set                                                   | Array, marked as unordered |
| Number, string or boolean                             | Plain value                |

Integer variables that the read finder sees used as an index into an array are drawn
as named pointers on that array. The call tree comes from `call` and `return` events
and is always available. A student's choice of view is kept in the browser for each
variable name (CUJ 4).

### Workspace and rendering

The workspace is a single screen: the editor and test cases on the left, the visuals
on the right, and a full-width timeline at the bottom. The timeline marks function
calls, errors and writes, so a student can see the shape of a run before playing it.
Space plays or pauses, and the arrow keys step.

Visuals are built from HTML and SVG. They give crisp text and can be read by screen
readers, and large tables can be limited to the visible cells.

| Library         | Used for                                                          |
|-----------------|-------------------------------------------------------------------|
| Motion (Framer) | Elements changing place, such as swaps, pushes, pops, tree growth |
| GSAP            | Multi-part sequences, such as read arrows then the value landing  |
| Three.js        | Landing page only, loaded separately to keep the workspace light  |
| CodeMirror 6    | Code editor and current-line highlight; far smaller than Monaco   |

Each screen is drawn purely from the current step number. Moving forward one step
during normal playback animates the change between the two steps. Dragging the
timeline, or moving backwards by more than one step, skips straight to the new state
with no animation, so fast scrubbing cannot fall behind. With the browser's
reduced-motion setting on, every change uses that same direct path.

The browser app does not need server rendering, since nearly all of it depends on
in-browser state. It is a static Vite and React single-page app that can be hosted on
any static host.

### Risks to test early

Each of these could change the plan, so each gets a short experiment before the work
that depends on it:

1.  **gdb inside gVisor.** gdb depends on `ptrace`, which gVisor has to emulate. If it
    is unreliable or too slow, C++ needs a different sandbox, such as a Firecracker
    microVM, or Valgrind-based tracing as Python Tutor uses.
2.  **Java and C++ speed.** JVM start, or C++ compilation with gdb, may exceed the
    5-second target even for short programs. The target may need to be per language.
3.  **Rendering at the limit.** Check that a 10,000-step trace with a large table stays
    smooth on a typical student laptop.

## Alternatives Considered

### Alternative A: Curated algorithm library, with test cases only

*   **Pros**: Hand-built animations look best. No untrusted code runs, so there is no
    sandbox and almost no server cost. This is the smallest build by a wide margin.
*   **Cons**: It cannot show why a student's own code is wrong. Existing sites already
    cover this ground.
*   **Reason for Rejection**: Debugging the student's own code is the purpose of the
    product.

### Alternative B: Real code plus a set of worked examples

*   **Pros**: A new student sees something working before writing any code.
*   **Cons**: Each example must be written and kept working in three languages.
*   **Reason for Rejection**: Decided against for the first release. The empty first
    screen remains an open question, and a single sample per language would be far
    less work than a full set.

### Alternative C: Python only, or Python and JavaScript, running in the browser

*   **Pros**: No server, no hosting cost and no untrusted code on our machines. Student
    code never leaves their laptop, and runs still work once the page has loaded.
*   **Cons**: Excludes students whose courses use C++ or Java. The Python runtime is a
    download of roughly 10 MB or more on first load.
*   **Reason for Rejection**: Language coverage was chosen over a server-free design.
    **This is the most expensive decision in this document.** The sandbox, rate limits,
    hosting and most of the security risk exist only because of it. If the Java and C++
    experiments go badly, this is the fallback.

### Alternative D: Python in the browser, Java and C++ on the server

*   **Pros**: Python runs are instant and free, which could cut server load considerably
    if most students use Python.
*   **Cons**: Two execution paths, each with its own errors, limits and tests. The
    Python tracer would also have to run under both.
*   **Reason for Rejection**: One path is simpler to build and test. This remains a good
    cost-cutting step later, because the trace format would not change.

### Alternative E: Third-party code execution service (Judge0, Piston or similar)

*   **Pros**: Someone else has already solved sandboxing, and possibly hosting too.
*   **Cons**: These services are built to compile, run and return output. Our runs also
    need a debugger attached, with tracer scripts installed alongside. That means custom
    images or unusual permissions, and for a hosted service it may not be possible.
*   **Reason for Rejection**: The tracer is the hard part and these services do not help
    with it. The sandbox they would replace is a modest amount of configuration. This
    was judged from how those services generally work, not from testing them, so it is
    worth a second look if the sandbox experiment fails.

### Alternative F: Debug Adapter Protocol as a single interface to all debuggers

*   **Pros**: `debugpy`, `java-debug` and gdb's DAP mode all speak one protocol, so in
    principle one tracer client could drive all three languages.
*   **Cons**: Reading variables takes several round trips per step, which adds up over
    10,000 steps. The protocol has no standard way to tell that two variables point at
    the same object, which the trace format depends on. It would also add a separate
    adapter process to each sandbox.
*   **Reason for Rejection**: Direct tracers give faster access to object identity. This
    is the alternative most likely to be worth revisiting if the gdb tracer becomes hard
    to maintain.

### Alternative G: Rewriting student code to insert recording calls

*   **Pros**: Fast, needs no debugger, and could record reads exactly, which would replace
    the best-guess read finder.
*   **Cons**: Needs a separate reliable parser and rewriter for each language. C++ makes
    this especially hard. A rewriter bug would make correct student code misbehave, which
    is the worst possible failure for a debugging tool.
*   **Reason for Rejection**: Too much risk and work for each language.

### Alternative H: Students mark up their code for the visualizer

*   **Pros**: Calls such as `viz.table(dp)` would remove the guessing from the view chooser.
*   **Cons**: Goes against pasting code unchanged. The markup has to be removed before
    submitting to LeetCode, and it asks new students to learn one more tool.
*   **Reason for Rejection**: The view menu on each variable (CUJ 4) corrects wrong guesses
    without changing the student's code.

### Alternative I: Draw all the visuals in 3D with Three.js

*   **Pros**: Most striking at first sight and the most different from other sites.
*   **Cons**: Cells hide behind each other and exact values are harder to read. Text is less
    crisp, screen readers get nothing, and low-end student laptops will struggle.
*   **Reason for Rejection**: Reading exact values is the point of a debugger. The visual
    character comes from motion and design instead, and 3D stays on the landing page. A 3D
    call stack could be tried later if it proves easier to understand, not just better
    looking.

### Alternative J: Next.js for the browser app

*   **Pros**: Widely known, with server rendering that helps search ranking on public pages.
*   **Cons**: The workspace runs entirely in the browser, so server rendering would add setup
    and gain almost nothing there.
*   **Reason for Rejection**: Vite is simpler for this app. If search traffic to the landing
    page becomes important, that page can be built as plain static HTML.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security**: The sandbox runs code from strangers, because the link is public. The
    API account can control Docker, which is equivalent to root on the VM. So the API
    passes student code only through standard input, starts containers from a fixed list
    of images with fixed arguments and never uses a shell. Trace output is also untrusted
    and is size-limited and validated. A forged trace can only affect the person who
    forged it, because nothing is stored or shared. The browser never renders trace
    values as HTML.
*   **Privacy**: Student code and IP addresses are not stored or logged. Logs record only
    language, duration and status.
*   **Cost and capacity**: One VM with 2 vCPUs and 4 GB of memory runs at most 2 sandboxes at
    a time. Up to 4 more runs can wait in the queue. Limits are 60 runs per hour per IP
    address and 500 runs per day in total. The daily limit keeps abuse from exhausting the
    VM. Reaching it shows a plain message until the next day. `RUN_LIMITS=off` removes these limits for local
    development and testing only.
*   **Rollback**: Each deploy keeps the previous web build and image tags. Rolling back means
    pointing back at them. There is no data to migrate.

### Future Improvements

*   **Google sign-in and per-account limits**, required before any wider launch, because IP
    limits are weak on shared college networks.
*   **Running Python in the browser** (Alternative D), to cut server load.
*   **Compile cache** for Java and C++, if repeated compiling is noticeably slow.
*   **Stronger C++ isolation**, such as a Firecracker microVM per run, before enabling C++ on a public server.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Build order

Each milestone produces something that can be run and checked.

1.  **Experiments.** gdb in gVisor, Java and C++ timing, and the 10,000-step render test.
    Record results in `docs/experiments.md` and update this design if any plan changes.
2.  **Python to trace.** Trace package, Python runner, sandbox and API.
3.  **Workspace.** Editor, test cases, playback, timeline, plain values and arrays.
4.  **DP.** Read finder, 1D and 2D tables, and read arrows.
5.  **Other views.** Buckets, stacks, queues, lists, trees and the call tree with memo hits.
6.  **Java runner.**
7.  **C++ runner.**
8.  **Landing page and deployment.**

### Technology choices

npm workspaces, TypeScript in strict mode, React 18, Vite, Zustand (app state), Motion, GSAP,
Three.js, CodeMirror 6, d3-hierarchy (tree layout), Zod (trace validation), Fastify with
`@fastify/rate-limit`, Vitest and Playwright. Runner images use Python 3.12, OpenJDK 21 and
g++ with gdb. Node 22 runs the API.

### Target Files to Create/Modify

All files are new, because the project folder is empty.

#### Root and shared package

##### 1. `./package.json`, `./tsconfig.base.json`, `./.gitignore` (Create)

*   **Type / Scope**: Workspace configuration.
*   **Proposed Changes**: Declares the workspaces `apps/*` and `packages/*`, with root scripts
    `dev`, `build`, `test` and `lint`. Sets shared strict TypeScript options and ignores build
    output and dependencies.

##### 2. `./README.md` (Create)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: What the project does, how to run it locally, how to build runner
    images and how to run tests. Author is Pallav Rai.

##### 3. `./docs/experiments.md` (Create)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Method, measurements and decision from each milestone 1 experiment, so
    the reasons for any change to this design stay on record.

##### 4. `./packages/trace/package.json`, `./packages/trace/src/index.ts` (Create)

*   **Type / Scope**: Shared TypeScript package.
*   **Proposed Changes**: The types and Zod schemas for `Trace`, `Step`, `Value` and `HeapObject`,
    as in the Technical Plan, plus the `RunRequest` type. API and browser import the same
    definitions, so they cannot drift apart.

#### Run API

##### 5. `./apps/api/package.json`, `./apps/api/src/server.ts` (Create)

*   **Type / Scope**: Fastify service.
*   **Proposed Changes**: `POST /runs`. Rejects code over 64 KB or a test case
    over 16 KB. Applies the rate limits, trusts the local Caddy proxy for the client IP, then
    calls the queue, sandbox and validation modules.

##### 6. `./apps/api/src/limits.ts` (Create)

*   **Type / Scope**: Constants.
*   **Proposed Changes**: One place for every limit named in this document, so they can be tuned
    after the experiments.

##### 7. `./apps/api/src/queue.ts` (Create)

*   **Type / Scope**: In-memory concurrency limit.
*   **Proposed Changes**: Runs at most 2 jobs with up to 4 waiting, and rejects further jobs, which
    `server.ts` turns into HTTP 429. Holds the daily total. Resets on restart, which is
    acceptable for a single personal server.

##### 8. `./apps/api/src/sandbox.ts` (Create)

*   **Type / Scope**: Container runner.
*   **Proposed Changes**: `runInSandbox(language, code, driver)` starts `docker run` through an
    argument array, never a shell, with: `--runtime=runsc`, `--network=none`, `--read-only`, a small
    `--tmpfs /tmp`, a non-root user, and memory, CPU and process limits. Sends code and driver as
    JSON on standard input. Reads the trace from standard output, killing the container if output
    passes 20 MB or the time limit expires. The C++ image gets only the extra permission that
    the gdb experiment shows it needs.

##### 9. `./apps/api/src/validateTrace.ts` (Create)

*   **Type / Scope**: Trust boundary.
*   **Proposed Changes**: Parses tracer output with the Zod schema and replaces invalid output with a
    `runtime_error` trace saying the run could not be recorded.

##### 10. `./apps/api/src/drivers/signature.ts`, `./apps/api/src/drivers/testCase.ts` (Create)

*   **Type / Scope**: Input parsing.
*   **Proposed Changes**: `signature.ts` finds the first public non-constructor method in `class
    Solution` for each language, returning method name and parameter types. `testCase.ts` parses
    one JSON value per line and checks the count against the parameters. Both return a clear error
    message shown next to the code or test case when parsing fails.

##### 11. `./apps/api/src/drivers/python.ts`, `java.ts`, `cpp.ts` (Create)

*   **Type / Scope**: Driver generators.
*   **Proposed Changes**: Generate the source that builds arguments as literals from parsed JSON, converts
    list input to `ListNode` and level-order input to `TreeNode`, calls the method and reports the
    result. The student's line numbers must stay unchanged. Common imports go on the first line in
    Java. C++ uses a `#line` directive. In Python they are added as globals outside the student's
    file. Parsing here in one place means the Java and C++ images need no JSON parser.

##### 12. `./apps/api/test/*.test.ts` (Create)

*   **Type / Scope**: Unit tests.
*   **Proposed Changes**: Signature parsing for each language, including LeetCode's commented-out
    `ListNode` block and multi-line signatures. Test case parsing, including bad input. Queue limits.
    Rejection of invalid traces.

##### 13. `./apps/api/test/conformance.test.ts` (Create)

*   **Type / Scope**: Integration test. Requires Docker and the runner images.
*   **Proposed Changes**: Runs every fixture through the real sandbox for each language. Checks that the
    result is right, the trace passes the schema and that line numbers and object references behave as
    expected, so all three tracers are held to one standard.

#### Runners

##### 14. `./runners/fixtures/` (Create)

*   **Type / Scope**: Test fixtures.
*   **Proposed Changes**: One solution per language for each of: two sum, coin change, memoized Fibonacci,
    reverse linked list, tree traversal, infinite loop and a crash. Also hostile cases: network
    access, fork bomb, memory exhaustion, deep recursion and forged trace output.

##### 15. `./runners/python/Dockerfile`, `./runners/python/tracer.py` (Create)

*   **Type / Scope**: Python tracer.
*   **Proposed Changes**: Records `call`, `line`, `return` and `exception` events from `sys.settrace` for the
    student's file only. Walks objects reachable from each frame by identity and emits only changes.
    Lists over 2,000 items are cut off and marked as truncated. Student printed output is captured
    separately from the trace. Stops at the step limit and always writes what it has.

##### 16. `./runners/java/Dockerfile`, `./runners/java/Tracer.java` (Create)

*   **Type / Scope**: Java tracer.
*   **Proposed Changes**: Compiles the student's code with debug information and launches it in a second JVM.
    Uses JDI step requests, excluding `java.*` and `jdk.*` classes. Maps arrays, `List`, `Map`, `Set`,
    `Deque` and `Stack` to trace `kind`s, and uses JDI object ids for identity. Same output and limits
    as the Python tracer.

##### 17. `./runners/cpp/Dockerfile`, `./runners/cpp/gdb_tracer.py`, `./runners/cpp/support.h` (Create)

*   **Type / Scope**: C++ tracer.
*   **Proposed Changes**: Compiles with `g++ -g -O0` and steps with gdb's Python API, skipping system headers so
    stepping never enters standard library code. Reads `vector`, `map`, `unordered_map`, `set`, `stack`,
    `queue` and `deque` through libstdc++'s pretty printers. Uses addresses for identity, and follows
    pointers to `ListNode` and `TreeNode` with a guard against bad addresses. A raw pointer to anything
    else appears as a plain address. `support.h` defines LeetCode's node types. Same output and limits.

#### Browser app: core

##### 18. `./apps/web/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` (Create)

*   **Type / Scope**: App setup.
*   **Proposed Changes**: Shows the landing page at `/` and the workspace at `/app` using a simple path check, with
    no router library. Both are loaded on demand, so Three.js never loads with the workspace.

##### 19. `./apps/web/src/styles/tokens.css` (Create)

*   **Type / Scope**: Design tokens.
*   **Proposed Changes**: Dark theme with one fixed colour meaning everywhere: amber for reads, teal for writes,
    violet for pointers, red for errors. Meaning is always also shown by arrows, labels or shapes, not by
    colour alone. Monospace type for all code and values.

##### 20. `./apps/web/src/store/workspace.ts` (Create)

*   **Type / Scope**: Zustand store.
*   **Proposed Changes**: Language, code, test cases, one trace per test case, selected test case, current step,
    play state, speed and view choices. Components select only what they use, so playback does not redraw
    the whole page each step.

##### 21. `./apps/web/src/api.ts`, `./apps/web/src/samples.ts` (Create)

*   **Type / Scope**: API client and starting content.
*   **Proposed Changes**: `api.ts` sends one request per test case, at most two at a time, and turns HTTP 429 and
    network failures into messages on the screen. `samples.ts` holds one short sample solution and test
    case per language for the first screen.

##### 22. `./apps/web/src/trace/traceStore.ts` (Create)

*   **Type / Scope**: Pure logic, no UI.
*   **Proposed Changes**: `stateAt(trace, step)` returns frames and objects at any step, using states cached every
    100 steps. All drawing depends on this function, so forward and backward stepping cannot disagree.

##### 23. `./apps/web/src/trace/readFinder.ts` (Create)

*   **Type / Scope**: Pure logic, no UI.
*   **Proposed Changes**: `findAccesses(lineSource, state)` returns reads and writes, as described in the Technical
    Plan. Uses a small tokenizer and an evaluator for integers, variable names and arithmetic only. Handles
    Python negative indexes. Drops anything it cannot fully resolve.

##### 24. `./apps/web/src/trace/chooseView.ts`, `./apps/web/src/trace/callTree.ts` (Create)

*   **Type / Scope**: Pure logic, no UI.
*   **Proposed Changes**: `chooseView` applies the ordered rules from the Technical Plan and a student's override.
    `callTree` builds the tree from `call` and `return` events and marks memo hits.

##### 25. `./apps/web/src/trace/*.test.ts` (Create)

*   **Type / Scope**: Unit tests.
*   **Proposed Changes**: `stateAt` matches a full replay at all steps. Read finder cases for all three languages,
    plus cases it must drop rather than guess. A rule table test for `chooseView`. Memo hits against base
    cases in `callTree`.

#### Browser app: interface

##### 26. `./apps/web/src/workspace/Workspace.tsx`, `Editor.tsx`, `TestCases.tsx` (Create)

*   **Type / Scope**: React components.
*   **Proposed Changes**: The screen layout. CodeMirror editor with language switch, current-line highlight and error
    markers. Test case panel with paste, add, remove, expected output and pass or fail status. Pass or fail
    compares normalized JSON, so spacing differences do not count as failures.

##### 27. `./apps/web/src/workspace/Timeline.tsx`, `Controls.tsx`, `usePlayback.ts` (Create)

*   **Type / Scope**: React components and hook.
*   **Proposed Changes**: Draggable timeline with marks for calls, writes and errors. Play, pause, step, restart and
    speed controls, with Space and arrow keys. Shows a clear banner when a run stopped at a limit.

##### 28. `./apps/web/src/views/ViewFrame.tsx`, `ValueView.tsx`, `ArrayView.tsx`, `BucketsView.tsx`, `StackQueueView.tsx`, `ListView.tsx`, `TreeView.tsx`, `GridView.tsx`, `DpTableView.tsx`, `CallTreeView.tsx` (Create)

*   **Type / Scope**: React components.
*   **Proposed Changes**: `ViewFrame` provides each variable's name, its view menu (CUJ 4) and a text alternative for
    screen readers. Each view takes the state at the current step and draws it. `DpTableView` handles 1D and 2D
    tables, marks reads and writes, and only draws visible cells for large tables. Trees use `d3-hierarchy`
    for layout. All views use the same step transition rules from the Technical Plan.

##### 29. `./apps/web/src/animation/readArrows.ts` (Create)

*   **Type / Scope**: GSAP sequence.
*   **Proposed Changes**: On normal playback, plays read cells highlighting, then arrows, then the new value landing.
    The sequence is cancelled if a new step arrives, and is skipped when reduced motion is on.

##### 30. `./apps/web/src/landing/Landing.tsx`, `./apps/web/src/landing/HeroScene.ts` (Create)

*   **Type / Scope**: Landing page.
*   **Proposed Changes**: A short page explaining the tool with one link into the workspace. `HeroScene` is a Three.js
    scene of a DP table filling in, which shows a still image under reduced motion or if WebGL is not available.

##### 31. `./apps/web/e2e/debug-dp.spec.ts`, `./apps/web/e2e/limits.spec.ts` (Create)

*   **Type / Scope**: Playwright end-to-end tests.
*   **Proposed Changes**: `debug-dp` covers CUJ 1, CUJ 2 and CUJ 4 in a real browser. `limits` covers CUJ 5 and CUJ 6.

#### Deployment

##### 32. `./deploy/Caddyfile`, `./deploy/vizdsa-api.service`, `./deploy/daemon.json`, `./deploy/README.md` (Create)

*   **Type / Scope**: Server configuration.
*   **Proposed Changes**: Caddy serves the static web build and sends `/runs` to the API from the same address, so no
    cross-origin setup is needed, and it handles HTTPS and gzip. A systemd unit runs the API under a dedicated user.
    `daemon.json` registers gVisor with Docker. `deploy/README.md` lists VM setup, image builds, deploying and
    rolling back.

### Verification Plan

*   **Build**: `npm run build`, plus `docker build` for all three runner images.
*   **Unit Tests**: `npm test` (Vitest), which must not need Docker.
*   **Runner Conformance**: `npm run test:conformance`, covering all fixtures in each language. Hostile fixtures must end
    with a limit or error status, with no network access and the VM still healthy.
*   **Static Analysis & Linting**: `npm run lint` (ESLint) and `tsc --noEmit`.
*   **Test Coverage Requirement**: No overall percentage. All files in `apps/web/src/trace/` and `apps/api/src/drivers/` need
    tests, because wrong results there mislead students without any visible error.
*   **E2E**: `npx playwright test` against a local API with real runner images.
*   **Manual Checks**: The first-visual time, run duration and scrubbing targets from Goals, on a typical student laptop.
    Keyboard-only use, a screen reader pass on one view, and use with reduced motion on.

--------------------------------------------------------------------------------

*Drafted with EGM*
