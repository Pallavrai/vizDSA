// Runs every fixture through a real sandbox. Needs Docker and `npm run build:images`.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { TraceSchema, type Language, type Trace } from '@vizdsa/trace';
import { buildDriver } from '../src/drivers/index.ts';
import { runInSandbox } from '../src/sandbox.ts';

process.env.SANDBOX_RUNTIME ??= 'runc';
process.env.SANDBOX_RUNTIME_CPP ??= 'runc';

const EXT: Record<Language, string> = { python: 'py', java: 'java', cpp: 'cpp' };
const dir = new URL('../../../runners/fixtures/', import.meta.url);

async function run(language: Language, name: string): Promise<{ trace: Trace; expected: unknown; code: string }> {
  const code = readFileSync(new URL(`${name}.${EXT[language]}`, dir), 'utf8');
  const { input, expected } = JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));
  const trace = await runInSandbox(language, code, buildDriver(language, code, input));
  TraceSchema.parse(trace);
  return { trace, expected, code };
}

describe.each(['python', 'java', 'cpp'] as const)('%s runner', (language) => {
  it.each(['two_sum', 'coin_change', 'fib_memo', 'reverse_list', 'tree_traversal', 'grid_dp'])('%s returns the right answer', async (name) => {
    const { trace, expected, code } = await run(language, name);
    expect(trace.error).toBeNull();
    expect(trace.status).toBe('ok');
    expect(trace.result).toEqual(expected);
    const lines = code.split('\n').length;
    expect(trace.steps.length).toBeGreaterThan(0);
    for (const s of trace.steps) expect(s.line).toBeLessThanOrEqual(lines);
    expect(trace.steps.some((s) => s.event === 'line')).toBe(true);
    // Calls and returns must balance so the browser can rebuild the stack.
    const open = new Set<number>();
    for (const s of trace.steps) {
      if (s.event === 'call') open.add(s.frameId);
      if (s.event === 'return') expect(open.delete(s.frameId)).toBe(true);
    }
    expect(open.size).toBe(0);
    const refs = new Set(trace.steps.flatMap((s) => s.heapChanges.map((h) => h.id)));
    for (const s of trace.steps) for (const c of s.frameChanges) {
      if (c.value && typeof c.value === 'object' && 'ref' in c.value) expect(refs.has(c.value.ref)).toBe(true);
    }
  });

  it('records the DP table filling in', async () => {
    const { trace } = await run(language, 'coin_change');
    const all = trace.steps.flatMap((s) => s.heapChanges).filter((h) => h.kind === 'list' && (h.contents as unknown[]).length === 12);
    expect(all.length).toBeGreaterThan(3);
    expect((all.at(-1)!.contents as number[])[11]).toBe(3);
  });

  it('records the memo growing one entry at a time through recursion', async () => {
    const { trace } = await run(language, 'fib_memo');
    const sizes = trace.steps.flatMap((s) => s.heapChanges).filter((h) => h.kind === 'map').map((h) => (h.contents as unknown[]).length);
    expect(sizes).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('stops an endless loop and keeps the recording', async () => {
    const { trace } = await run(language, 'infinite_loop');
    expect(['step_limit', 'time_limit']).toContain(trace.status);
    expect(trace.steps.length).toBeGreaterThan(100);
  });

  it('reports a crash on the failing line with earlier steps kept', async () => {
    const { trace } = await run(language, 'crash');
    expect(trace.status).toBe('runtime_error');
    expect(trace.error?.line).toBeGreaterThanOrEqual(3);
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('reports a compile error on the right line', async () => {
    const { trace } = await run(language, 'compile_error');
    expect(trace.status).toBe('compile_error');
    expect(trace.error?.line).toBe(language === 'cpp' ? 4 : language === 'python' ? 3 : 3);
  });

  it('has no network', async () => {
    const { trace, expected } = await run(language, 'hostile_network');
    expect(trace.result).toBe(expected);
  });

  it.each(['hostile_fork_bomb', 'hostile_memory', 'hostile_deep_recursion', 'hostile_forged_trace'])('%s ends cleanly', async (name) => {
    const { trace } = await run(language, name);
    TraceSchema.parse(trace);
  });
});

it('counts the same recursive calls in Java and C++', async () => {
  const count = async (language: Language) => (await run(language, 'fib_memo')).trace.steps.filter((s) => s.event === 'call').length;
  expect(await count('cpp')).toBe(await count('java'));
});

describe('after the hostile programs', () => {
  it('leaves no containers running', () => {
    const left = execFileSync('docker', ['ps', '-q', '--filter', 'name=vizdsa-'], { encoding: 'utf8' }).trim();
    expect(left).toBe('');
  });
});
