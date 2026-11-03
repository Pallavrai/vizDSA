export class QueueFull extends Error {}
export class DailyLimitReached extends Error {}

export type RunQueue = { run<T>(job: () => Promise<T>): Promise<T> };

// shortcut: state is in memory and resets on restart, move to Redis if this ever runs on more than one server.
export function createQueue(maxActive: number, maxQueued: number, perDay: number, now = Date.now): RunQueue {
  let active = 0;
  const waiting: Array<() => void> = [];
  let dayStart = now();
  let dayCount = 0;

  return {
    async run(job) {
      if (now() - dayStart >= 86_400_000) {
        dayStart = now();
        dayCount = 0;
      }
      if (dayCount >= perDay) throw new DailyLimitReached();
      if (active >= maxActive && waiting.length >= maxQueued) throw new QueueFull();
      dayCount++;
      if (active >= maxActive) await new Promise<void>((resolve) => waiting.push(resolve));
      else active++;
      try {
        return await job();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    },
  };
}
