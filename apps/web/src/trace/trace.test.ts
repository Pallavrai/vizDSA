import { describe, expect, it } from 'vitest';
import type { HeapObject, Step, Trace, Value } from '@vizdsa/trace';
import { analyzeTrace } from './analyzeTrace.ts';
import { availableViews, chooseView } from './chooseView.ts';
import { findAccesses } from './readFinder.ts';
import { verdict } from './testResult.ts';
import { applyStep, createTraceStore, emptyState, type TraceState } from './traceStore.ts';

const list = (id: string, contents: Value[]): HeapObject => ({ id, kind: 'list', contents });

function makeState(vars: Record<string, Value>, heap: HeapObject[]): TraceState {
  return { frames: [{ id: 1, functionName: 'f', vars }], heap: new Map(heap.map((h) => [h.id, h])), pendingPop: null };
}

const step = (over: Partial<Step>): Step => ({ event: 'line', line: 1, frameId: 1, functionName: 'f', frameChanges: [], heapChanges: [], ...over });
const trace = (steps: Step[]): Trace => ({ version: 1, language: 'python', status: 'ok', error: null, stdout: '', steps });

describe('stateAt', () => {
  it('matches a full replay at every step, including across keyframes', () => {
    const steps: Step[] = [step({ event: 'call', frameChanges: [{ name: 'a', value: { ref: 'o1' } }], heapChanges: [list('o1', [0])] })];
    for (let i = 1; i < 350; i++) steps.push(step({ frameChanges: [{ name: 'i', value: i }], heapChanges: i % 7 === 0 ? [list('o1', [i])] : [] }));
    const store = createTraceStore(trace(steps));
    const replay = emptyState();
    steps.forEach((s, i) => {
      applyStep(replay, s);
      const got = store.stateAt(i);
      expect(got.frames).toEqual(replay.frames);
      expect([...got.heap]).toEqual([...replay.heap]);
    });
    // Going backwards must not be affected by earlier reads.
    expect(store.stateAt(5).frames[0].vars.i).toBe(5);
  });

  it('removes a frame on the step after it returns', () => {
    const store = createTraceStore(trace([step({ event: 'call' }), step({ event: 'call', frameId: 2 }), step({ event: 'return', frameId: 2 }), step({ frameId: 1 })]));
    expect(store.stateAt(2).frames.map((f) => f.id)).toEqual([1, 2]);
    expect(store.stateAt(3).frames.map((f) => f.id)).toEqual([1]);
  });
});

describe('findAccesses', () => {
  const dp2 = [{ id: 'd', kind: 'list', contents: [{ ref: 'r0' }, { ref: 'r1' }] } as HeapObject, list('r0', [1, 1]), list('r1', [1, 0])];
  const vars = { dp: { ref: 'd' }, i: 1, j: 1, coin: 2 };

  it.each(['python', 'java', 'cpp'] as const)('finds 2D reads and the write in %s', (language) => {
    const line = language === 'python' ? 'dp[i][j] = dp[i - 1][j] + dp[i][j - 1]' : 'dp[i][j] = dp[i - 1][j] + dp[i][j - 1];';
    const out = findAccesses(line, makeState(vars, dp2), language);
    expect(out.writes).toEqual([{ ref: 'd', path: [1, 1] }]);
    expect(out.reads).toEqual([{ ref: 'd', path: [0, 1] }, { ref: 'd', path: [1, 0] }]);
  });

  it('finds Java get and C++ at calls', () => {
    const state = makeState({ dp: { ref: 'a' }, i: 2 }, [list('a', [5, 6, 7])]);
    expect(findAccesses('int x = dp.get(i - 1);', state, 'java').reads).toEqual([{ ref: 'a', path: [1] }]);
    expect(findAccesses('int x = dp.at(i);', state, 'cpp').reads).toEqual([{ ref: 'a', path: [2] }]);
  });

  it('handles Python negative indexes, and rejects them elsewhere', () => {
    const state = makeState({ a: { ref: 'a' } }, [list('a', [1, 2, 3])]);
    expect(findAccesses('x = a[-1]', state, 'python').reads).toEqual([{ ref: 'a', path: [2] }]);
    expect(findAccesses('x = a[-1];', state, 'java').reads).toEqual([]);
  });

  it('treats += as both a read and a write', () => {
    const state = makeState({ a: { ref: 'a' }, i: 0 }, [list('a', [1])]);
    const out = findAccesses('a[i] += 1', state, 'python');
    expect(out.writes).toEqual([{ ref: 'a', path: [0] }]);
    expect(out.reads).toEqual([{ ref: 'a', path: [0] }]);
  });

  it('reads nested indexes', () => {
    const state = makeState({ a: { ref: 'a' }, b: { ref: 'b' }, i: 0 }, [list('a', [1, 2]), list('b', [9, 8])]);
    const out = findAccesses('x = a[b[i] - 8]', state, 'python');
    expect(out.reads).toContainEqual({ ref: 'b', path: [0] });
    expect(out.reads).toContainEqual({ ref: 'a', path: [1] });
  });

  it('does not treat for-header or comparison = as writes', () => {
    const state = makeState({ a: { ref: 'a' }, i: 0 }, [list('a', [1])]);
    expect(findAccesses('for (int k = a[i]; k < 3; k++) {', state, 'java').writes).toEqual([]);
    expect(findAccesses('if (a[i] == 1) {', state, 'java').writes).toEqual([]);
  });

  it.each([
    ['an out-of-range index', 'x = a[5]'],
    ['a function call in the index', 'x = a[len(a)]'],
    ['an unknown variable', 'x = a[nope]'],
    ['text in a comment', '# a[0]'],
    ['a helper call', 'x = helper(a)'],
  ])('drops %s instead of guessing', (_label, line) => {
    const state = makeState({ a: { ref: 'a' } }, [list('a', [1, 2])]);
    expect(findAccesses(line, state, 'python').reads).toEqual([]);
  });

  it('finds map reads through in, get and containsKey', () => {
    const memo: HeapObject = { id: 'm', kind: 'map', contents: [[3, 2]] };
    const state = makeState({ memo: { ref: 'm' }, n: 3 }, [memo]);
    expect(findAccesses('if n in memo:', state, 'python').reads).toEqual([{ ref: 'm', path: [] }]);
    expect(findAccesses('return memo[n]', state, 'python').reads).toEqual([{ ref: 'm', path: [3] }]);
    expect(findAccesses('if (memo.containsKey(n)) {', state, 'java').reads).toEqual([{ ref: 'm', path: [3] }]);
    expect(findAccesses('if (memo.count(n)) {', state, 'cpp').reads).toEqual([{ ref: 'm', path: [3] }]);
  });

  it('resolves fields of the Solution object', () => {
    const self: HeapObject = { id: 's', kind: 'object', contents: { dp: { ref: 'a' } } };
    const state = makeState({ this: { ref: 's' }, i: 0 }, [self, list('a', [4])]);
    expect(findAccesses('return dp[i];', state, 'java').reads).toEqual([{ ref: 'a', path: [0] }]);
    expect(findAccesses('return this.dp[i];', state, 'java').reads).toEqual([{ ref: 'a', path: [0] }]);
  });
});

describe('chooseView', () => {
  const none = () => undefined;
  const base = { changes: 1, sizeChanged: true, pushed: false, popped: false, midEdit: false, selfDependent: false, pointers: new Set<string>() };
  const empty = makeState({}, []);

  it.each([
    ['list node', { id: 'x', kind: 'object', contents: { val: 1, next: null } } as HeapObject, 'list'],
    ['tree node', { id: 'x', kind: 'object', contents: { val: 1, left: null, right: null } } as HeapObject, 'tree'],
    ['other object', { id: 'x', kind: 'object', contents: { a: 1 } } as HeapObject, 'object'],
    ['stack', { id: 'x', kind: 'stack', contents: [] } as HeapObject, 'stack'],
    ['queue', { id: 'x', kind: 'queue', contents: [] } as HeapObject, 'queue'],
    ['map', { id: 'x', kind: 'map', contents: [] } as HeapObject, 'buckets'],
    ['set', { id: 'x', kind: 'set', contents: [] } as HeapObject, 'set'],
  ])('%s', (_label, obj, want) => {
    expect(chooseView('v', obj, empty, undefined, none)).toBe(want);
  });

  it('picks a DP table by name or by self-dependent writes', () => {
    expect(chooseView('dp', list('x', [0]), empty, undefined, none)).toBe('dp');
    expect(chooseView('ways', list('x', [0]), empty, { ...base, selfDependent: true }, none)).toBe('dp');
  });

  it('picks a stack for a list changed only by push and pop', () => {
    expect(chooseView('s', list('x', [0]), empty, { ...base, pushed: true, popped: true }, none)).toBe('stack');
    expect(chooseView('out', list('x', [0]), empty, { ...base, pushed: true }, none)).toBe('array');
  });

  it('separates 2D DP tables from grids and adjacency lists', () => {
    const table = { id: 't', kind: 'list', contents: [{ ref: 'a' }, { ref: 'b' }] } as HeapObject;
    const state = makeState({}, [table, list('a', [1, 2]), list('b', [3, 4])]);
    expect(chooseView('g', table, state, undefined, (r) => (r === 'a' ? base : undefined))).toBe('dp');
    expect(chooseView('g', table, state, undefined, none)).toBe('grid');
    const jagged = makeState({}, [table, list('a', [1]), list('b', [3, 4])]);
    expect(chooseView('dp', table, jagged, undefined, none)).toBe('grid');
    expect(availableViews('grid', table, jagged)).toEqual(['dp', 'grid']);
  });
});

describe('analyzeTrace', () => {
  const code = ['def go(k):', '  if k <= 1: return k', '  if k in memo: return memo[k]', '  memo[k] = go(k-1)', '  return memo[k]'].join('\n');
  const memo = (contents: [Value, Value][]): HeapObject => ({ id: 'm', kind: 'map', contents });
  const memoVar = { name: 'memo', value: { ref: 'm' } };

  it('marks a leaf call answered from the memo, and not a base case', () => {
    const steps: Step[] = [
      step({ event: 'call', frameId: 1, frameChanges: [{ name: 'k', value: 3 }, memoVar], heapChanges: [memo([])] }),
      step({ frameId: 1, line: 4 }),
      step({ event: 'call', frameId: 2, frameChanges: [{ name: 'k', value: 1 }, memoVar] }),
      step({ frameId: 2, line: 2 }),
      step({ event: 'return', frameId: 2, returnValue: 1 }),
      step({ frameId: 1, line: 4, heapChanges: [memo([[3, 1]])] }),
      step({ event: 'call', frameId: 3, frameChanges: [{ name: 'k', value: 3 }, memoVar] }),
      step({ frameId: 3, line: 3 }),
      step({ event: 'return', frameId: 3, returnValue: 1 }),
      step({ event: 'return', frameId: 1, returnValue: 1 }),
    ];
    const a = analyzeTrace(trace(steps), code);
    expect(a.calls.get(2)!.memoHit).toBe(false);
    expect(a.calls.get(3)!.memoHit).toBe(true);
    expect(a.calls.get(1)!.memoHit).toBe(false);
    expect(a.calls.get(1)!.children).toEqual([2, 3]);
    expect(a.calls.get(3)!.args).toBe('3');
    expect(a.calls.get(2)!.returnValue).toBe(1);
  });

  it('records which cells changed on each step', () => {
    const a = analyzeTrace(trace([step({ event: 'call', heapChanges: [list('a', [0, 0])] }), step({ heapChanges: [list('a', [0, 5])] })]), '');
    expect([...a.changed[1].get('a')!]).toEqual(['1']);
    expect(a.objects.get('a')!.changes).toBe(1);
  });
});

describe('verdict', () => {
  it('compares as JSON and ignores spacing and key order', () => {
    expect(verdict('[1, 2]', [1, 2])).toBe('pass');
    expect(verdict('{"b":1,"a":2}', { a: 2, b: 1 })).toBe('pass');
    expect(verdict('[1,2]', [2, 1])).toBe('fail');
    expect(verdict('', 5)).toBe('none');
    expect(verdict('hello', 'hello')).toBe('pass');
  });
});
