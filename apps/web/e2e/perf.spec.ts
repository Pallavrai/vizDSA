import { expect, test } from '@playwright/test';
import { runAndWait, setCode, setInput, totalSteps } from './helpers.ts';

const CODE = `class Solution:
    def f(self, m: int, n: int) -> int:
        dp = [[1] * n for _ in range(m)]
        for i in range(1, m):
            for j in range(1, n):
                dp[i][j] = (dp[i - 1][j] + dp[i][j - 1]) % 1000
        return dp[m - 1][n - 1]
`;

// Records frame timing while dragging across the whole run. Limits come from the design's scrubbing target.
test('scrubbing stays smooth at the 10,000-step limit', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await setCode(page, CODE);
  await setInput(page, '60\n60');
  const started = Date.now();
  await runAndWait(page);
  const runMs = Date.now() - started;
  const steps = await totalSteps(page);
  const status = await page.locator('.step-readout').textContent();
  const metrics = await page.getByLabel('Timeline').evaluate(async (el: HTMLInputElement, max) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const gaps: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 300; i++) {
      set.call(el, String(Math.floor((i / 300) * max)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }
    gaps.sort((a, b) => a - b);
    return { median: gaps[150], p95: gaps[285], worst: gaps[299] };
  }, steps - 1);
  console.log(JSON.stringify({ steps, runMs, status, metrics }));
  expect(steps).toBeGreaterThan(5000);
  expect(metrics.p95).toBeLessThan(50);
});
