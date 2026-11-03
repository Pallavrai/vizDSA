import type { HeapObject, Value } from '@vizdsa/trace';
import type { ObjectInfo } from './analyzeTrace.ts';
import { isRef, type TraceState } from './traceStore.ts';

export type ViewName = 'array' | 'set' | 'dp' | 'grid' | 'buckets' | 'stack' | 'queue' | 'list' | 'tree' | 'object';

export const VIEW_LABELS: Record<ViewName, string> = {
  array: 'Array', set: 'Array (unordered)', dp: 'DP table', grid: 'Grid', buckets: 'Buckets', stack: 'Stack', queue: 'Queue', list: 'Linked list', tree: 'Tree', object: 'Fields',
};

const DP_NAME = /^(?:self\.|this\.)?(dp|memo|cache|table|tab|f)\d*$/i;

function rows(obj: HeapObject, state: TraceState): HeapObject[] | null {
  if (!Array.isArray(obj.contents) || obj.contents.length === 0) return null;
  const out: HeapObject[] = [];
  for (const v of obj.contents as Value[]) {
    if (!isRef(v)) return null;
    const row = state.heap.get(v.ref);
    if (!row || !Array.isArray(row.contents) || row.kind === 'map') return null;
    out.push(row);
  }
  return out;
}

function isCell(v: Value): boolean {
  return typeof v === 'number' || typeof v === 'boolean' || v === null || (typeof v === 'object' && v !== null && 'text' in v);
}

export function is2D(obj: HeapObject, state: TraceState): boolean {
  return rows(obj, state) !== null;
}

// Rules run in order and the first match wins. The student can overrule any of them from the view menu.
export function chooseView(name: string, obj: HeapObject, state: TraceState, info: ObjectInfo | undefined, rowInfo: (ref: string) => ObjectInfo | undefined): ViewName {
  if (obj.kind === 'object') {
    const fields = obj.contents as Record<string, Value>;
    if ('next' in fields) return 'list';
    if ('left' in fields && 'right' in fields) return 'tree';
    return 'object';
  }
  if (obj.kind === 'stack') return 'stack';
  if (obj.kind === 'queue') return 'queue';
  if (obj.kind === 'map') return 'buckets';
  if (obj.kind === 'set') return 'set';
  const table = rows(obj, state);
  if (table) {
    const rectangular = table.every((r) => (r.contents as unknown[]).length === (table[0].contents as unknown[]).length);
    const numeric = table.every((r) => (r.contents as Value[]).every(isCell));
    const changed = table.some((r) => (rowInfo(r.id)?.changes ?? 0) > 0);
    return rectangular && numeric && (changed || DP_NAME.test(name)) ? 'dp' : 'grid';
  }
  if (DP_NAME.test(name) || info?.selfDependent) return 'dp';
  if (info?.pushed && info.popped && !info.midEdit) return 'stack';
  return 'array';
}

export function availableViews(chosen: ViewName, obj: HeapObject, state: TraceState): ViewName[] {
  if (obj.kind === 'map') return ['buckets'];
  if (obj.kind === 'object') return [chosen];
  if (is2D(obj, state)) return ['dp', 'grid'];
  return obj.kind === 'set' ? ['set'] : ['array', 'dp', 'stack', 'queue'];
}
