import type { HeapObject, Trace, Value } from '@vizdsa/trace';
import { findAccesses, type Accesses, type Cell } from './readFinder.ts';
import { applyStep, emptyState, isRef, valueText } from './traceStore.ts';

export type CallNode = {
  frameId: number;
  parent: number | null;
  children: number[];
  functionName: string;
  args: string;
  startStep: number;
  endStep: number | null;
  returnValue: Value | undefined;
  memoHit: boolean;
};

export type ObjectInfo = {
  changes: number;
  sizeChanged: boolean;
  pushed: boolean;
  popped: boolean;
  midEdit: boolean;
  selfDependent: boolean;
  pointers: Set<string>;
};

export type Analysis = {
  accesses: Accesses[];
  // Per step: for each object, which indexes or keys changed on that step.
  changed: Array<Map<string, Set<string>>>;
  objects: Map<string, ObjectInfo>;
  calls: Map<number, CallNode>;
  roots: number[];
  firstSeen: Map<string, number>;
  nodeOrder: string[];
};

const EMPTY: Accesses = { reads: [], writes: [], pointers: [] };

function info(objects: Map<string, ObjectInfo>, ref: string): ObjectInfo {
  let found = objects.get(ref);
  if (!found) {
    found = { changes: 0, sizeChanged: false, pushed: false, popped: false, midEdit: false, selfDependent: false, pointers: new Set() };
    objects.set(ref, found);
  }
  return found;
}

function diffKeys(before: HeapObject | undefined, after: HeapObject): Set<string> {
  const keys = new Set<string>();
  if (!before) return keys;
  if (after.kind === 'map') {
    const old = new Map((before.contents as [Value, Value][]).map(([k, v]) => [valueText(k), JSON.stringify(v)]));
    for (const [k, v] of after.contents as [Value, Value][]) if (old.get(valueText(k)) !== JSON.stringify(v)) keys.add(valueText(k));
  } else if (after.kind === 'object') {
    const old = before.contents as Record<string, Value>;
    for (const [k, v] of Object.entries(after.contents as Record<string, Value>)) if (JSON.stringify(old[k]) !== JSON.stringify(v)) keys.add(k);
  } else {
    const old = before.contents as Value[];
    (after.contents as Value[]).forEach((v, i) => {
      if (JSON.stringify(old[i]) !== JSON.stringify(v)) keys.add(String(i));
    });
  }
  return keys;
}

// Plain values and node values tell calls apart. Containers are often closure variables, which only add noise.
function argsText(values: Array<{ name: string; value?: Value }>, heap: Map<string, HeapObject>): string {
  const shown = values
    .filter((c) => c.name !== 'self' && c.name !== 'this' && c.value !== undefined)
    .map((c) => {
      if (!isRef(c.value)) return valueText(c.value);
      const obj = heap.get(c.value.ref);
      const val = obj?.kind === 'object' ? (obj.contents as Record<string, Value>).val : undefined;
      return val !== undefined ? valueText(val) : null;
    });
  const kept = shown.filter((t) => t !== null);
  return kept.length ? kept.join(', ') : shown.length ? '…' : '';
}

// One pass over the run, done once when a trace arrives, so the views can look things up per step.
export function analyzeTrace(trace: Trace, code: string): Analysis {
  const lines = code.split('\n');
  const a: Analysis = { accesses: [], changed: [], objects: new Map(), calls: new Map(), roots: [], firstSeen: new Map(), nodeOrder: [] };
  const state = emptyState();
  const written = new Set<string>();
  const ordered = new Set<string>();
  const stack: number[] = [];

  const orderNodes = (start: Value | undefined) => {
    let v = start;
    while (isRef(v) && !ordered.has(v.ref)) {
      const obj = state.heap.get(v.ref);
      if (obj?.kind !== 'object' || !('next' in (obj.contents as object))) return;
      ordered.add(v.ref);
      a.nodeOrder.push(v.ref);
      v = (obj.contents as Record<string, Value>).next;
    }
  };

  trace.steps.forEach((step, i) => {
    const before = new Map<string, HeapObject | undefined>(step.heapChanges.map((h) => [h.id, state.heap.get(h.id)]));
    applyStep(state, step);

    const changed = new Map<string, Set<string>>();
    for (const h of step.heapChanges) {
      const prev = before.get(h.id);
      if (!a.firstSeen.has(h.id)) a.firstSeen.set(h.id, i);
      if (!prev) continue;
      changed.set(h.id, diffKeys(prev, h));
      written.add(h.id);
      const o = info(a.objects, h.id);
      o.changes++;
      if (Array.isArray(h.contents) && Array.isArray(prev.contents)) {
        const delta = h.contents.length - prev.contents.length;
        if (delta !== 0) o.sizeChanged = true;
        const prefix = Math.min(h.contents.length, prev.contents.length);
        const sameTail = JSON.stringify(h.contents.slice(0, prefix)) === JSON.stringify(prev.contents.slice(0, prefix));
        if (delta > 0 && sameTail) o.pushed = true;
        else if (delta < 0 && sameTail) o.popped = true;
        else o.midEdit = true;
      }
    }
    a.changed.push(changed);

    const frame = state.frames.at(-1);
    if (frame) for (const c of step.frameChanges) orderNodes(c.value);

    if (step.event === 'call') {
      const parent = stack.at(-1) ?? null;
      a.calls.set(step.frameId, { frameId: step.frameId, parent, children: [], functionName: step.functionName, args: argsText(step.frameChanges, state.heap), startStep: i, endStep: null, returnValue: undefined, memoHit: false });
      if (parent === null) a.roots.push(step.frameId);
      else a.calls.get(parent)!.children.push(step.frameId);
      stack.push(step.frameId);
    } else if (step.event === 'return') {
      const node = a.calls.get(step.frameId);
      if (node) {
        node.endStep = i;
        node.returnValue = step.returnValue;
      }
      if (stack.at(-1) === step.frameId) stack.pop();
    }

    const source = step.event === 'line' ? lines[step.line - 1] : undefined;
    const accesses = source ? findAccesses(source, state, trace.language) : EMPTY;
    a.accesses.push(accesses);
    for (const p of accesses.pointers) info(a.objects, p.ref).pointers.add(p.name);
    const wroteRefs = new Set(accesses.writes.map((c: Cell) => c.ref));
    for (const r of accesses.reads) if (wroteRefs.has(r.ref)) info(a.objects, r.ref).selfDependent = true;

    // A call that answers from earlier-written data, without recursing further, is a memo hit.
    const node = a.calls.get(step.frameId);
    if (node && accesses.reads.some((r) => written.has(r.ref) && !wroteRefs.has(r.ref))) node.memoHit = true;
  });

  for (const node of a.calls.values()) if (node.children.length > 0 || node.parent === null) node.memoHit = false;
  return a;
}
