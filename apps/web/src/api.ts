import type { Language, RunInputError, Trace } from '@vizdsa/trace';

export type RunOutcome = { trace: Trace } | { inputError: RunInputError };

export async function runTestCase(language: Language, code: string, testCaseInput: string): Promise<RunOutcome> {
  let response: Response;
  try {
    response = await fetch('/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language, code, testCaseInput }),
    });
  } catch {
    return { inputError: { error: 'Could not reach the server. Check your connection and run again.', where: 'code' } };
  }
  if (response.ok) return { trace: (await response.json()) as Trace };
  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as RunInputError | null;
    return { inputError: { error: body?.where ? body.error : 'Too many runs in the last hour. Try again later.', where: 'code' } };
  }
  const body = (await response.json().catch(() => null)) as RunInputError | null;
  return { inputError: body?.error ? body : { error: 'The server could not run this code. Try again.', where: 'code' } };
}
