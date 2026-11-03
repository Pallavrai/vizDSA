export type Verdict = 'pass' | 'fail' | 'none';

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
  }
  return v;
}

function parseExpected(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

// Compares as JSON, so spacing differences in the expected output do not count as failures.
export function verdict(expected: string, result: unknown): Verdict {
  if (!expected.trim()) return 'none';
  return JSON.stringify(canonical(parseExpected(expected))) === JSON.stringify(canonical(result)) ? 'pass' : 'fail';
}

export function resultText(result: unknown): string {
  return result === undefined ? '' : JSON.stringify(result);
}
