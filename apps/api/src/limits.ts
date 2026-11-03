export const LIMITS = {
  // Sent to the tracers so every limit lives in this one file.
  steps: 10_000,
  seconds: 10,
  stdoutBytes: 64 * 1024,
  traceBytes: 16 * 1024 * 1024,
};

export const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
export const MAX_CODE_BYTES = 64 * 1024;
export const MAX_TEST_CASE_BYTES = 16 * 1024;

// Compile time plus the tracer's own limit plus a margin; the tracer normally stops first.
export const HARD_KILL_MS = 30_000;

export const MEMORY = { python: '256m', java: '640m', cpp: '512m' } as const;
export const PIDS_LIMIT = { python: 32, java: 256, cpp: 64 } as const;

export const MAX_ACTIVE_RUNS = 2;
export const MAX_QUEUED_RUNS = 4;
export const RUNS_PER_HOUR_PER_IP = 60;
export const RUNS_PER_DAY = 500;

// Only the local dev script turns these off. Any other environment, including a missing setting, stays limited.
export function runLimits(env: NodeJS.ProcessEnv = process.env) {
  if (env.RUN_LIMITS === 'off') return { perHourPerIp: null, perDay: Infinity, maxQueued: Infinity };
  return { perHourPerIp: RUNS_PER_HOUR_PER_IP, perDay: RUNS_PER_DAY, maxQueued: MAX_QUEUED_RUNS };
}
