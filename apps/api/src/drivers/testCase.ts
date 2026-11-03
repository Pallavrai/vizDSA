import { DriverError } from './error.ts';

// LeetCode's format: one JSON value per line, one line per parameter.
export function parseTestCase(input: string, paramCount: number): unknown[] {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length !== paramCount) {
    throw new DriverError(`This method takes ${paramCount} parameter${paramCount === 1 ? '' : 's'}, but the test case has ${lines.length} line${lines.length === 1 ? '' : 's'}. Put each parameter on its own line.`, 'testCase');
  }
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new DriverError(`Line ${i + 1} of the test case is not valid. Examples of valid values: [1,2,3], 9, "abc", true.`, 'testCase');
    }
  });
}
