import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { WarningCircle } from '@phosphor-icons/react';
import type { HeapObject, Value } from '@vizdsa/trace';
import { currentRun, useWorkspace } from '../store/workspace.ts';
import type { Analysis } from '../trace/analyzeTrace.ts';
import { availableViews, chooseView, is2D, type ViewName } from '../trace/chooseView.ts';
import { isRef, valueText, type TraceState } from '../trace/traceStore.ts';
import { ArrayView } from './ArrayView.tsx';
import { BucketsView } from './BucketsView.tsx';
import { CallTreeView, callTreeSummary } from './CallTreeView.tsx';
import { DpTableView, type Coord } from './DpTableView.tsx';
import { ListView } from './ListView.tsx';
import { QueueView, StackView } from './StackQueueView.tsx';
import { TreeView } from './TreeView.tsx';
import { ObjectFields, ValueStrip } from './ValueView.tsx';
import { ViewFrame } from './ViewFrame.tsx';

type Named = { name: string; ref: string; obj: HeapObject };

// Fields of `self` / `this` appear as their own variables, so `self.memo` looks like any other memo.
function currentVars(state: TraceState): Array<[string, Value]> {
  const frame = state.frames.at(-1);
  if (!frame) return [];
  const out: Array<[string, Value]> = [];
  for (const [name, value] of Object.entries(frame.vars)) {
    if ((name === 'self' || name === 'this') && isRef(value)) {
      const obj = state.heap.get(value.ref);
      if (obj?.kind === 'object') for (const [k, v] of Object.entries(obj.contents as Record<string, Value>)) out.push([`${name}.${k}`, v]);
    } else {
      out.push([name, value]);
    }
  }
  return out;
}

// Structures from every live frame stay on screen, so a recursive call does not make the table vanish.
function collect(state: TraceState): Named[] {
  const named = new Map<string, Named>();
  const add = (name: string, value: Value) => {
    if (!isRef(value) || named.has(value.ref)) return;
    const obj = state.heap.get(value.ref);
    if (obj) named.set(value.ref, { name, ref: value.ref, obj });
  };
  // Oldest frame first, so a structure keeps its name (root, not n) as recursion goes deeper.
  for (const frame of state.frames) {
    for (const [name, value] of Object.entries(frame.vars)) {
      if (name !== 'self' && name !== 'this') add(name, value);
      else if (isRef(value)) {
        const obj = state.heap.get(value.ref);
        if (obj?.kind === 'object') for (const [k, v] of Object.entries(obj.contents as Record<string, Value>)) add(`${name}.${k}`, v);
      }
    }
  }
  for (const [name, value] of currentVars(state)) add(name, value);
  return [...named.values()];
}

function linkedReach(ref: string, state: TraceState, field: 'tree' | 'list'): Set<string> {
  const seen = new Set<string>();
  const stack = [ref];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const f = state.heap.get(id)?.contents as Record<string, Value> | undefined;
    if (!f) continue;
    for (const k of field === 'tree' ? ['left', 'right'] : ['next']) {
      const v = f[k];
      if (isRef(v)) stack.push(v.ref);
    }
  }
  return seen;
}

function tableCoords(cells: Array<{ ref: string; path: Array<number | string> }>, ref: string, dims: 1 | 2): Coord[] {
  const out: Coord[] = [];
  for (const c of cells) {
    if (c.ref !== ref) continue;
    if (dims === 1 && c.path.length === 1 && typeof c.path[0] === 'number') out.push([0, c.path[0]]);
    if (dims === 2 && c.path.length === 2 && typeof c.path[0] === 'number' && typeof c.path[1] === 'number') out.push([c.path[0], c.path[1]]);
  }
  return out;
}

function describe(name: string, obj: HeapObject): string {
  const text = JSON.stringify(obj.contents, (_k, v) => (v && typeof v === 'object' && 'ref' in v ? 'nested' : v));
  return `${name}: ${text.length > 400 ? text.slice(0, 400) + '…' : text}`;
}

function DataFrame({ item, state, analysis, step, animated }: { item: Named; state: TraceState; analysis: Analysis; step: number; animated: boolean }) {
  const override = useWorkspace((s) => s.viewOverrides[item.name]);
  const setView = useWorkspace((s) => s.setView);
  const { obj, ref, name } = item;
  const chosen = chooseView(name, obj, state, analysis.objects.get(ref), (r) => analysis.objects.get(r));
  const views = availableViews(chosen, obj, state);
  const view: ViewName = override && views.includes(override) ? override : chosen;
  const changed = analysis.changed[step]?.get(ref);
  // A step's reads belong to the line that just ran, which is what produced this step's change.
  const previous = step > 0 ? analysis.accesses[step - 1] : undefined;
  const reads = previous?.reads ?? [];
  const readKeys = new Set(reads.filter((c) => c.ref === ref && c.path.length).map((c) => String(c.path[0])));
  const list = obj.contents as Value[];

  let body;
  if (view === 'dp' || view === 'grid') {
    const twoD = is2D(obj, state);
    const rows: Value[][] = twoD
      ? list.map((v) => (state.heap.get((v as { ref: string }).ref)?.contents ?? []) as Value[])
      : [list.map((v) => (isRef(v) ? { text: '…' } : v))];
    if (view === 'grid') {
      body = twoD ? (
        <div className="grid-rows">
          {rows.map((row, r) => {
            const rowRef = (list[r] as { ref: string }).ref;
            const rowChanged = analysis.changed[step]?.get(rowRef);
            return (
              <div className="grid-row" key={r}>
                <span className="ruler grid-label">{r}</span>
                <ArrayView items={row} changed={rowChanged} />
              </div>
            );
          })}
        </div>
      ) : <ArrayView items={list} changed={changed} reads={readKeys} />;
    } else {
      const changedCoords: Coord[] = [];
      if (twoD) {
        list.forEach((v, r) => {
          for (const c of analysis.changed[step]?.get((v as { ref: string }).ref) ?? []) changedCoords.push([r, Number(c)]);
        });
      } else {
        for (const c of changed ?? []) changedCoords.push([0, Number(c)]);
      }
      const readCoords = tableCoords(reads, ref, twoD ? 2 : 1);
      const target = changedCoords.length === 1 ? changedCoords[0] : null;
      const sources = target ? readCoords.filter(([r, c]) => r !== target[0] || c !== target[1]) : [];
      body = <DpTableView rows={rows} changed={changedCoords} reads={readCoords} arrowsTo={sources.length ? target : null} animated={animated} />;
      return (
        <ViewFrame title={name} view={view} views={views} onChange={(v) => setView(name, v)} summary={describe(name, obj)} truncated={obj.truncated}>
          <DpTableView rows={rows} changed={changedCoords} reads={sources.length ? sources : readCoords} arrowsTo={sources.length ? target : null} animated={animated} />
        </ViewFrame>
      );
    }
  } else if (view === 'buckets') {
    const mapReads = new Set(reads.filter((c) => c.ref === ref && c.path.length).map((c) => valueText(c.path[0] as Value)));
    body = <BucketsView entries={obj.contents as [Value, Value][]} changed={changed} reads={mapReads} state={state} />;
  } else if (view === 'stack') {
    body = <StackView items={list} />;
  } else if (view === 'queue') {
    body = <QueueView items={list} />;
  } else if (view === 'object') {
    body = <ObjectFields fields={obj.contents as Record<string, Value>} />;
  } else {
    const frameVars = state.frames.at(-1)?.vars ?? {};
    const pointers = [...(analysis.objects.get(ref)?.pointers ?? [])]
      .map((p) => ({ name: p, index: frameVars[p] as number }))
      .filter((p) => typeof p.index === 'number' && p.index >= 0 && p.index < list.length);
    body = <ArrayView items={list} changed={changed} reads={readKeys} pointers={pointers} unordered={view === 'set'} />;
  }
  return (
    <ViewFrame title={name} view={view} views={views} onChange={(v) => setView(name, v)} summary={describe(name, obj)} truncated={obj.truncated}>
      {body}
    </ViewFrame>
  );
}

function kindOf(obj: HeapObject): 'list' | 'tree' | null {
  if (obj.kind !== 'object') return null;
  const f = obj.contents as object;
  if ('next' in f) return 'list';
  if ('left' in f && 'right' in f) return 'tree';
  return null;
}

function nodeSummary(label: string, ids: Iterable<string>, state: TraceState): string {
  const values = [...ids].map((id) => valueText((state.heap.get(id)?.contents as Record<string, Value>)?.val));
  return `${label} with values ${values.join(', ')}`;
}

export function Visuals() {
  const run = useWorkspace(currentRun);
  const step = useWorkspace((s) => s.step);
  const animated = useWorkspace((s) => s.animate);
  const running = useWorkspace((s) => s.running);

  const state = useMemo(() => run?.store.stateAt(step), [run, step]);
  if (!run || !state) {
    return (
      <div className="placeholder">
        {running ? <p className="placeholder-title">Recording your run…</p> : (
          <>
            <p className="placeholder-title">Press Run to record your code.</p>
            <p>You can then play it, step through it, or drag the timeline to any moment.</p>
          </>
        )}
      </div>
    );
  }

  const { trace, analysis } = run;
  const stepData = trace.steps[step];
  const vars = currentVars(state);
  const primitives = vars.filter(([, v]) => !isRef(v));
  const items = collect(state).sort((a, b) => (analysis.firstSeen.get(a.ref) ?? 0) - (analysis.firstSeen.get(b.ref) ?? 0));

  const listItems = items.filter((i) => kindOf(i.obj) === 'list');
  const treeItems = items.filter((i) => kindOf(i.obj) === 'tree');
  const data = items.filter((i) => !kindOf(i.obj));
  const changedNow = new Set(analysis.changed[step]?.keys() ?? []);

  // Every variable that points at a node becomes a label on it, rather than a separate drawing.
  const nodePointers = vars.filter(([, v]) => isRef(v)).map(([name, v]) => ({ name, ref: (v as { ref: string }).ref }));
  const listNodes = new Set<string>();
  for (const i of listItems) linkedReach(i.ref, state, 'list').forEach((id) => listNodes.add(id));
  const orderedNodes = [...analysis.nodeOrder.filter((id) => listNodes.has(id)), ...[...listNodes].filter((id) => !analysis.nodeOrder.includes(id))];
  const listIsNull = vars.filter(([, v]) => v === null).map(([n]) => n);

  // A subtree someone points at is already drawn inside its parent's tree.
  const treeRoots = treeItems.filter((t) => !treeItems.some((o) => o.ref !== t.ref && linkedReach(o.ref, state, 'tree').has(t.ref)));
  const recursive = analysis.calls.size > 1;
  const summary = recursive ? callTreeSummary(analysis, step) : null;
  const atEnd = step === trace.steps.length - 1;

  return (
    <div className="visuals">
      <AnimatePresence initial={false}>
        {trace.error && (trace.steps.length === 0 || atEnd) && (
          <motion.p key="error" className="banner banner-error" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <WarningCircle size={16} weight="fill" aria-hidden />
            <span>
              {trace.status === 'compile_error' ? 'Did not compile' : trace.status === 'runtime_error' ? 'Crashed' : 'Stopped early'}
              {trace.error.line ? ` on line ${trace.error.line}` : ''}: {trace.error.message}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      {stepData && (
        <div className="frame-line">
          <span className="eyebrow">In</span>
          <div className="stack-trail">
            {state.frames.slice(-5).map((f, i, shown) => (
              <span key={f.id} className={`crumb ${i === shown.length - 1 ? 'is-current' : ''}`}>{f.functionName}</span>
            ))}
            {state.frames.length > 5 && <span className="crumb-count">depth {state.frames.length}</span>}
          </div>
          {stepData.event === 'return' && stepData.returnValue !== undefined && (
            <span className="return-note">returns <code>{isRef(stepData.returnValue) ? '…' : valueText(stepData.returnValue)}</code></span>
          )}
          {trace.status === 'ok' && atEnd && <span className="finished-note" role="status">Finished</span>}
        </div>
      )}
      <ValueStrip vars={primitives} />
      {data.map((item) => <DataFrame key={item.ref} item={item} state={state} analysis={analysis} step={step} animated={animated} />)}
      {orderedNodes.length > 0 && (
        <ViewFrame title="Linked list" view="list" views={['list']} onChange={() => {}} summary={nodeSummary('Linked list', orderedNodes, state)}>
          <ListView nodes={orderedNodes} pointers={nodePointers} nulls={listIsNull} state={state} changed={changedNow} />
        </ViewFrame>
      )}
      {treeRoots.map((t) => (
        <ViewFrame key={t.ref} title={t.name} view="tree" views={['tree']} onChange={() => {}} summary={nodeSummary('Tree', linkedReach(t.ref, state, 'tree'), state)}>
          <TreeView rootRef={t.ref} pointers={nodePointers} state={state} changed={changedNow} />
        </ViewFrame>
      ))}
      {recursive && summary && (
        <figure className="frame">
          <figcaption className="frame-head">
            <span className="frame-title">Calls</span>
            <span className="frame-kind">{summary.total} call{summary.total === 1 ? '' : 's'}{summary.hits ? `, ${summary.hits} answered from the memo` : ''}</span>
          </figcaption>
          <div className="frame-body">
            <CallTreeView analysis={analysis} step={step} currentFrame={state.frames.at(-1)?.id} />
          </div>
        </figure>
      )}
      {stepData && stepData.event === 'exception' && stepData.message && <p className="banner banner-error">{stepData.message}</p>}
      {trace.stdout && (
        <figure className="frame">
          <figcaption className="frame-head"><span className="frame-title">Printed output</span></figcaption>
          <pre className="stdout">{trace.stdout}</pre>
        </figure>
      )}
    </div>
  );
}
