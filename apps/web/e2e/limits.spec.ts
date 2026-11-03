import { expect, test } from '@playwright/test';
import { goToStep, runAndWait, setCode, setInput, totalSteps } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
});

test('CUJ 5: an endless loop stops with a message and stays explorable', async ({ page }) => {
  await setCode(page, `class Solution:
    def spin(self, n: int) -> int:
        while n > 0:
            n = n + 1
        return n
`);
  await setInput(page, '1');
  await runAndWait(page);
  expect(await totalSteps(page)).toBe(10000);
  await goToStep(page, 9999);
  await expect(page.getByRole('alert')).toContainText('Stopped');
  await goToStep(page, 5000);
  await expect(page.locator('.chip', { hasText: 'n' })).toBeVisible();
});

test('CUJ 6: a crash stops on its line and keeps earlier steps', async ({ page }) => {
  await setCode(page, `class Solution:
    def boom(self, nums: List[int]) -> int:
        i = 5
        return nums[i]
`);
  await setInput(page, '[1,2]');
  await runAndWait(page);
  const steps = await totalSteps(page);
  expect(steps).toBeGreaterThan(2);
  await goToStep(page, steps - 1);
  await expect(page.getByRole('alert').first()).toContainText('IndexError');
  await expect(page.getByRole('alert').first()).toContainText('line 4');
  await expect(page.locator('.cm-errorLine')).toHaveCount(1);
});

test('CUJ 6: a compile error points at the line', async ({ page }) => {
  await setCode(page, `class Solution:
    def bad(self, n: int) -> int:
        return n +
`);
  await setInput(page, '1');
  await runAndWait(page);
  await expect(page.getByRole('alert').first()).toContainText('Did not compile on line 3');
  await expect(page.locator('.cm-errorLine')).toHaveCount(1);
});

test('a bad test case gets a message next to the field', async ({ page }) => {
  await setInput(page, '[1,2\n6');
  await runAndWait(page);
  await expect(page.locator('#test-error')).toContainText('not valid');
  await expect(page.getByLabel('Input, one parameter per line')).toHaveAttribute('aria-invalid', 'true');
});

for (const [lang, code] of [
  ['Java', `class Solution {
    public int climbStairs(int n) {
        int[] dp = new int[n + 1];
        dp[0] = 1;
        dp[1] = 1;
        for (int i = 2; i <= n; i++) {
            dp[i] = dp[i - 1] + dp[i - 2];
        }
        return dp[n];
    }
}
`],
  ['C++', `class Solution {
public:
    int climbStairs(int n) {
        vector<int> dp(n + 1, 0);
        dp[0] = 1;
        dp[1] = 1;
        for (int i = 2; i <= n; i++) {
            dp[i] = dp[i - 1] + dp[i - 2];
        }
        return dp[n];
    }
};
`],
] as const) {
  test(`${lang}: DP arrows work the same as Python`, async ({ page }) => {
    await page.getByRole('radio', { name: lang }).click();
    await setCode(page, code);
    await setInput(page, '4', '5');
    await runAndWait(page);
    await expect(page.getByText('Passed.')).toBeVisible();
    const steps = await totalSteps(page);
    let arrows = 0;
    for (let s = 1; s < steps && arrows === 0; s++) {
      await goToStep(page, s);
      arrows = await page.locator('.dp-arrow').count();
    }
    expect(arrows).toBe(2);
  });
}

test('reduced motion: no arrows animate, and everything is still drawn', async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('/app');
  await runAndWait(page);
  await page.getByRole('button', { name: 'Step forward' }).click();
  const steps = await totalSteps(page);
  for (let s = 1; s < steps; s++) {
    await page.getByRole('button', { name: 'Step forward' }).click();
    if ((await page.locator('.dp-arrow').count()) > 0) break;
  }
  await expect(page.locator('.dp-arrow').first()).toBeVisible();
  expect(await page.locator('.dp-arrow').first().evaluate((el) => el.style.strokeDashoffset)).toBe('');
});
