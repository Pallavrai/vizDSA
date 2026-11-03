import { TraceSchema, type Language, type Trace, type TraceStatus } from '@vizdsa/trace';

export function errorTrace(language: Language, status: TraceStatus, message: string): Trace {
  return { version: 1, language, status, error: { message }, stdout: '', steps: [] };
}

// Tracer output comes from a sandbox running untrusted code, so it is never trusted as is.
export function validateTrace(language: Language, output: string): Trace {
  try {
    const trace = TraceSchema.parse(JSON.parse(output));
    if (trace.language === language) return trace;
  } catch {
    // Falls through to the error trace below.
  }
  return errorTrace(language, 'runtime_error', 'This run could not be recorded.');
}
