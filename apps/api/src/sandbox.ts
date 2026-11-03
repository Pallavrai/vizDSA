import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Language, Trace } from '@vizdsa/trace';
import { HARD_KILL_MS, LIMITS, MAX_OUTPUT_BYTES, MEMORY, PIDS_LIMIT } from './limits.ts';
import { errorTrace, validateTrace } from './validateTrace.ts';

const IMAGES: Record<Language, string> = {
  python: 'vizdsa-runner-python',
  java: 'vizdsa-runner-java',
  cpp: 'vizdsa-runner-cpp',
};

export class LanguageDisabled extends Error {}

// gdb does not work under gVisor (docs/experiments.md), so C++ needs its own explicit
// opt-in to a weaker runtime. With no setting, C++ is refused instead of silently weakened.
export function runtimeFor(language: Language, env: NodeJS.ProcessEnv = process.env): string {
  if (language === 'cpp') {
    if (!env.SANDBOX_RUNTIME_CPP) throw new LanguageDisabled('C++ is not enabled on this server.');
    return env.SANDBOX_RUNTIME_CPP;
  }
  return env.SANDBOX_RUNTIME ?? 'runsc';
}

export function dockerArgs(language: Language, name: string, runtime: string): string[] {
  return [
    'run', '--rm', '-i',
    '--name', name,
    `--runtime=${runtime}`,
    '--network=none',
    '--read-only',
    // C++ must run the binary it just compiled, so only that image gets an executable /tmp.
    '--tmpfs', language === 'cpp' ? '/tmp:rw,exec,size=64m' : '/tmp:rw,size=64m',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--memory=${MEMORY[language]}`,
    `--memory-swap=${MEMORY[language]}`,
    '--cpus=1',
    `--pids-limit=${PIDS_LIMIT[language]}`,
    IMAGES[language],
  ];
}

export function runInSandbox(language: Language, code: string, driver: unknown): Promise<Trace> {
  const runtime = runtimeFor(language);
  const name = `vizdsa-${randomUUID()}`;
  return new Promise((resolve) => {
    // Argument array and stdin only: student code never reaches a shell or docker's arguments.
    const child = spawn('docker', dockerArgs(language, name, runtime), { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let size = 0;
    let killedFor: 'time' | 'size' | null = null;

    const kill = (reason: 'time' | 'size') => {
      killedFor = reason;
      spawn('docker', ['kill', name], { stdio: 'ignore' }).on('error', () => {});
    };
    const timer = setTimeout(() => kill('time'), HARD_KILL_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) {
        if (!killedFor) kill('size');
        return;
      }
      chunks.push(chunk);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ code, driver, limits: LIMITS }));

    child.on('error', () => {
      clearTimeout(timer);
      resolve(errorTrace(language, 'runtime_error', 'The code runner is not available.'));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (killedFor === 'time') {
        resolve(errorTrace(language, 'time_limit', 'The run took too long and was stopped before it could return its recording.'));
      } else if (killedFor === 'size') {
        resolve(errorTrace(language, 'step_limit', 'The recording grew too large. Try a smaller test case.'));
      } else if (exitCode === 137) {
        resolve(errorTrace(language, 'runtime_error', 'The run was stopped because it used too much memory.'));
      } else {
        resolve(validateTrace(language, Buffer.concat(chunks).toString('utf8')));
      }
    });
  });
}
