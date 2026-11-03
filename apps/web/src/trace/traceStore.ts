import type { HeapObject, Step, Trace, Value } from '@vizdsa/trace';

export type FrameState = { id: number; functionName: string; vars: Record<string, Value> };
export type TraceState = { frames: FrameState[]; heap: Map<string, HeapObject>; pendingPop: number | null };

const KEYFRAME_EVERY = 100;

export function emptyState(): TraceState {
  return { frames: [], heap: new Map(), pendingPop: null };
}

function cloneState(s: TraceState): TraceState {
  return { frames: s.frames.map((f) => ({ ...f, vars: { ...f.vars } })), heap: new Map(s.heap), pendingPop: s.pendingPop };
}

export function applyStep(state: TraceState, step: Step): void {
  // A returning frame stays visible on its return step and leaves on the next one.
  if (state.pendingPop !== null) {
    const at = state.frames.findIndex((f) => f.id === state.pendingPop);
    if (at >= 0) state.frames.splice(at);
    state.pendingPop = null;
  }
  let frame = state.frames.find((f) => f.id === step.frameId);
  if (!frame) {
    frame = { id: step.frameId, functionName: step.functionName, vars: {} };
    state.frames.push(frame);
  }
  for (const c of step.frameChanges) {
    if (c.value === undefined) delete frame.vars[c.name];
    else frame.vars[c.name] = c.value;
  }
  for (const h of step.heapChanges) state.heap.set(h.id, h);
  if (step.event === 'return') state.pendingPop = step.frameId;
}

export type TraceStore = { stateAt(step: number): TraceState };

// Scrubbing must reach any step without replaying the whole run, so full states are cached.
export function createTraceStore(trace: Trace): TraceStore {
  const keyframes: TraceState[] = [];
  const running = emptyState();
  trace.steps.forEach((step, i) => {
    applyStep(running, step);
    if (i % KEYFRAME_EVERY === 0) keyframes.push(cloneState(running));
  });
  return {
    stateAt(step) {
      if (trace.steps.length === 0) return emptyState();
      const clamped = Math.max(0, Math.min(step, trace.steps.length - 1));
      const k = Math.floor(clamped / KEYFRAME_EVERY);
      const state = cloneState(keyframes[k]);
      for (let i = k * KEYFRAME_EVERY + 1; i <= clamped; i++) applyStep(state, trace.steps[i]);
      return state;
    },
  };
}

export function isRef(v: Value | undefined): v is { ref: string } {
  return typeof v === 'object' && v !== null && 'ref' in v;
}

export function valueText(v: Value | undefined): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return 'ref' in v ? '…' : v.text;
  return String(v);
}
