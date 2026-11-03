import { create } from 'zustand';
import type { Language, RunInputError, Trace } from '@vizdsa/trace';
import { runTestCase } from '../api.ts';
import { SAMPLE_CODE, SAMPLE_TEST } from '../samples.ts';
import { analyzeTrace, type Analysis } from '../trace/analyzeTrace.ts';
import type { ViewName } from '../trace/chooseView.ts';
import { createTraceStore, type TraceStore } from '../trace/traceStore.ts';

export const MAX_TEST_CASES = 6;
const MAX_PARALLEL_RUNS = 2;

export const SPEEDS = [
  { label: '0.5×', ms: 1100 },
  { label: '1×', ms: 600 },
  { label: '2×', ms: 300 },
  { label: '4×', ms: 140 },
  { label: 'Max', ms: 30 },
];

export type TestCase = { id: number; input: string; expected: string };
export type Run =
  | { state: 'running' }
  | { state: 'error'; error: RunInputError }
  | { state: 'done'; trace: Trace; store: TraceStore; analysis: Analysis; code: string };

type Store = {
  language: Language;
  codes: Record<Language, string>;
  testCases: TestCase[];
  runs: Record<number, Run>;
  selected: number;
  running: boolean;
  step: number;
  playing: boolean;
  speed: number;
  animate: boolean;
  viewOverrides: Record<string, ViewName>;
  setLanguage(language: Language): void;
  setCode(code: string): void;
  addTestCase(): void;
  removeTestCase(id: number): void;
  updateTestCase(id: number, patch: Partial<TestCase>): void;
  select(id: number): void;
  run(): Promise<void>;
  goTo(step: number): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  setView(name: string, view: ViewName): void;
};

let nextId = 2;

export const useWorkspace = create<Store>((set, get) => ({
  language: 'python',
  codes: { ...SAMPLE_CODE },
  testCases: [{ id: 1, ...SAMPLE_TEST }],
  runs: {},
  selected: 1,
  running: false,
  step: 0,
  playing: false,
  speed: 1,
  animate: false,
  viewOverrides: {},

  setLanguage: (language) => set({ language, runs: {}, step: 0, playing: false }),
  setCode: (code) => set((s) => ({ codes: { ...s.codes, [s.language]: code } })),
  addTestCase: () =>
    set((s) => {
      if (s.testCases.length >= MAX_TEST_CASES) return s;
      const id = nextId++;
      return { testCases: [...s.testCases, { id, input: '', expected: '' }], selected: id, step: 0, playing: false };
    }),
  removeTestCase: (id) =>
    set((s) => {
      if (s.testCases.length === 1) return s;
      const testCases = s.testCases.filter((t) => t.id !== id);
      return { testCases, selected: s.selected === id ? testCases[0].id : s.selected, step: s.selected === id ? 0 : s.step };
    }),
  updateTestCase: (id, patch) => set((s) => ({ testCases: s.testCases.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  select: (id) => set((s) => (s.selected === id ? s : { selected: id, step: 0, playing: false, animate: false })),

  async run() {
    const { language, codes, testCases, selected } = get();
    const code = codes[language];
    set({ running: true, playing: false, step: 0, animate: false, runs: Object.fromEntries(testCases.map((t) => [t.id, { state: 'running' as const }])), selected });
    const queue = [...testCases];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const outcome = await runTestCase(language, code, t.input);
        const id = t.id;
        const run: Run = 'inputError' in outcome
          ? { state: 'error', error: outcome.inputError }
          : { state: 'done', trace: outcome.trace, store: createTraceStore(outcome.trace), analysis: analyzeTrace(outcome.trace, code), code };
        set((s) => ({ runs: { ...s.runs, [id]: run } }));
      }
    };
    await Promise.all(Array.from({ length: MAX_PARALLEL_RUNS }, worker));
    set({ running: false });
  },

  goTo(step) {
    const s = get();
    const run = s.runs[s.selected];
    if (run?.state !== 'done') return;
    const clamped = Math.max(0, Math.min(step, run.trace.steps.length - 1));
    // Only a single step animates. A jump shows the new state directly, so scrubbing can never fall behind.
    set({ step: clamped, animate: Math.abs(clamped - s.step) === 1 && SPEEDS[s.speed].ms >= 140 });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setView: (name, view) => set((s) => ({ viewOverrides: { ...s.viewOverrides, [name]: view } })),
}));

export function currentRun(s: Pick<Store, 'runs' | 'selected'>): Extract<Run, { state: 'done' }> | null {
  const run = s.runs[s.selected];
  return run?.state === 'done' ? run : null;
}
