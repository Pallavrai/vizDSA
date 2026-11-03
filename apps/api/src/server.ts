import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { RunRequestSchema } from '@vizdsa/trace';
import { buildDriver, DriverError } from './drivers/index.ts';
import { MAX_ACTIVE_RUNS, MAX_CODE_BYTES, MAX_TEST_CASE_BYTES, runLimits } from './limits.ts';
import { createQueue, DailyLimitReached, QueueFull } from './queue.ts';
import { LanguageDisabled, runInSandbox } from './sandbox.ts';

// Student code must never reach logs, so request logging stays off.
const app = Fastify({ logger: false, trustProxy: '127.0.0.1', bodyLimit: MAX_CODE_BYTES + MAX_TEST_CASE_BYTES + 1024 });
const limits = runLimits();
const queue = createQueue(MAX_ACTIVE_RUNS, limits.maxQueued, limits.perDay);

await app.register(rateLimit, { global: false });

const routeConfig: { rateLimit?: { max: number; timeWindow: string } } = limits.perHourPerIp === null ? {} : { rateLimit: { max: limits.perHourPerIp, timeWindow: '1 hour' } };

app.post('/runs', { config: routeConfig }, async (request, reply) => {
  const parsed = RunRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid request.', where: 'code' });
  const { language, code, testCaseInput } = parsed.data;
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return reply.code(413).send({ error: 'That code is over the 64 KB limit.', where: 'code' });
  if (Buffer.byteLength(testCaseInput) > MAX_TEST_CASE_BYTES) return reply.code(413).send({ error: 'That test case is over the 16 KB limit.', where: 'testCase' });

  try {
    const driver = buildDriver(language, code, testCaseInput);
    const started = Date.now();
    const trace = await queue.run(() => runInSandbox(language, code, driver));
    console.log(JSON.stringify({ language, ms: Date.now() - started, status: trace.status }));
    return trace;
  } catch (e) {
    if (e instanceof DriverError) return reply.code(422).send({ error: e.message, where: e.where });
    if (e instanceof QueueFull) return reply.code(429).send({ error: 'The server is busy. Try again in a moment.', where: 'code' });
    if (e instanceof DailyLimitReached) return reply.code(429).send({ error: 'The daily run limit has been reached. Try again tomorrow.', where: 'code' });
    if (e instanceof LanguageDisabled) return reply.code(503).send({ error: e.message, where: 'code' });
    throw e;
  }
});

await app.listen({ port: Number(process.env.PORT ?? 8787), host: '127.0.0.1' });
console.log('vizDSA API listening');
