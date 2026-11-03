# vizDSA

Author: Pallav Rai

Paste your own LeetCode-style solution and test case in Python, Java or C++, then step through it visually:
arrays with pointers, hash map buckets, stacks, queues, linked lists, trees, recursive calls and DP tables with
arrows showing where each value came from.

The design is in [docs/designs/vizdsa.md](docs/designs/vizdsa.md). Experiment results are in
[docs/experiments.md](docs/experiments.md).

## Run it locally

Needs Node 22.18 or later, and Docker running.

```bash
npm install
```

```bash
npm run build:images
```

```bash
npm run dev
```

Then open http://localhost:5173. The dev script runs sandboxes under plain Docker with C++ enabled and turns run
limits off (`RUN_LIMITS=off`). Those settings are for your own machine only. See [deploy/README.md](deploy/README.md).

## Tests

```bash
npm test
```

```bash
npm run test:conformance
```

```bash
npm run test:e2e
```

```bash
npm run lint
```

`npm test` needs nothing else running. The conformance tests need Docker and the runner images. The browser tests
also need `npm run dev` running, and use your installed Chrome. Set `PW_CHANNEL` to use another browser.

## Layout

*   `packages/trace`: the trace format and its validation, shared by the API and the browser.
*   `apps/api`: receives a run, generates a driver and starts a sandbox.
*   `runners/`: one tracer image per language, plus test programs in `runners/fixtures`.
*   `apps/web`: the browser app. `src/trace` holds the logic, `src/views` draws it.
*   `deploy/`: server configuration.
