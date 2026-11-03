import { expect, test } from '@playwright/test';
import { goToStep, runAndWait, setCode, setInput, totalSteps } from './helpers.ts';

const GRID = `class Solution:
    def uniquePaths(self, m: int, n: int) -> int:
        dp = [[1] * n for _ in range(m)]
        for i in range(1, m):
            for j in range(1, n):
                dp[i][j] = dp[i - 1][j] + dp[i][j - 1]
        return dp[m - 1][n - 1]
`;

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
});

test('CUJ 1: a DP table fills in with arrows from its source cells', async ({ page }) => {
  await setCode(page, GRID);
  await setInput(page, '3\n3', '6');
  await runAndWait(page);
  await expect(page.getByText('Passed.')).toBeVisible();
  const steps = await totalSteps(page);
  let arrows = 0;
  for (let s = 1; s < steps && arrows === 0; s++) {
    await goToStep(page, s);
    arrows = await page.locator('.dp-arrow').count();
  }
  expect(arrows).toBe(2);
  await expect(page.locator('.frame', { hasText: 'DP table' })).toBeVisible();
  await expect(page.locator('.dp-cell.is-write')).toHaveCount(1);
  await expect(page.locator('.dp-cell.is-read')).toHaveCount(2);
  await expect(page.locator('.cm-currentStep')).toHaveCount(1);
  await goToStep(page, steps - 1);
  await expect(page.locator('[data-cell="2-2"]')).toHaveText('6');
  // Stepping back restores the earlier value.
  await goToStep(page, 0);
  await expect(page.locator('.dp-cell')).toHaveCount(0);
});

test('play advances and pause stops', async ({ page }) => {
  await runAndWait(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText(/^Step [2-9] of/)).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  const readout = await page.locator('.step-readout').textContent();
  await page.waitForTimeout(800);
  expect(await page.locator('.step-readout').textContent()).toBe(readout);
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(page.locator('.step-readout')).not.toHaveText(readout!);
});

test('CUJ 2: several test cases each report pass or fail', async ({ page }) => {
  await setInput(page, '[1,2,5]\n6', '2');
  await page.getByRole('button', { name: 'Add test case' }).click();
  await setInput(page, '[2]\n3', '999');
  await page.getByRole('button', { name: 'Add test case' }).click();
  await setInput(page, '[1]\n2', '');
  await runAndWait(page);
  await expect(page.getByRole('tab', { name: 'Case 1' }).getByLabel('passed')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Case 2' }).getByLabel('failed')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Case 3' }).getByLabel('ran')).toBeVisible();
  await page.getByRole('tab', { name: 'Case 2' }).click();
  await expect(page.getByText('Failed.')).toBeVisible();
  await expect(page.locator('.result-line')).toContainText('999');
  expect(await totalSteps(page)).toBeGreaterThan(5);
});

test('CUJ 4: choosing another view redraws without running again', async ({ page }) => {
  await setCode(page, GRID);
  await setInput(page, '2\n2');
  let requests = 0;
  page.on('request', (r) => { if (r.url().endsWith('/runs')) requests++; });
  await runAndWait(page);
  await goToStep(page, (await totalSteps(page)) - 1);
  const frame = page.locator('.frame', { hasText: 'dp' }).first();
  await frame.getByLabel('View dp as').selectOption('grid');
  await expect(page.locator('.dp-cell')).toHaveCount(0);
  await expect(frame.locator('.grid-row')).toHaveCount(2);
  await frame.getByLabel('View dp as').selectOption('dp');
  await expect(page.locator('.dp-cell')).toHaveCount(4);
  expect(requests).toBe(1);
});

test('CUJ 3: memoized recursion marks cached calls', async ({ page }) => {
  await setCode(page, `class Solution:
    def fib(self, n: int) -> int:
        memo = {}
        def go(k):
            if k <= 1:
                return k
            if k in memo:
                return memo[k]
            memo[k] = go(k - 1) + go(k - 2)
            return memo[k]
        return go(n)
`);
  await setInput(page, '6', '8');
  await runAndWait(page);
  await goToStep(page, (await totalSteps(page)) - 1);
  await expect(page.getByText(/\d+ calls, \d+ answered from the memo/)).toBeVisible();
  expect(await page.locator('.call-hit').count()).toBeGreaterThan(0);
  await expect(page.locator('.frame', { hasText: 'Buckets' })).toBeVisible();
  await page.screenshot({ path: 'test-results/memo.png', fullPage: false });
});

test('editing the code warns that the visuals are out of date', async ({ page }) => {
  await runAndWait(page);
  await page.locator('.cm-content').click();
  await page.keyboard.type('# x');
  await expect(page.getByText('The code changed.')).toBeVisible();
});
