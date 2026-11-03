import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/api/test/conformance.test.ts'], testTimeout: 90_000 },
});
