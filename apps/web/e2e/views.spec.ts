import { expect, test } from '@playwright/test';
import { goToStep, runAndWait, setCode, setInput, totalSteps } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
});

test('a linked list reversal flips arrows while nodes stay put', async ({ page }) => {
  await setCode(page, `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev
`);
  await setInput(page, '[1,2,3]', '[3,2,1]');
  await runAndWait(page);
  await expect(page.getByText('Passed.')).toBeVisible();
  await goToStep(page, 12);
  await expect(page.locator('.list-node')).toHaveCount(3);
  await expect(page.locator('.list-edge')).toHaveCount(1);
  await expect(page.locator('.list-node').first()).toHaveText('1');
  await expect(page.locator('.list-pointer', { hasText: 'prev' })).toBeVisible();
  await page.screenshot({ path: 'test-results/list.png' });
});

test('a tree traversal draws the tree and the call tree', async ({ page }) => {
  await setCode(page, `class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        out = []
        def go(n):
            if not n:
                return
            go(n.left)
            out.append(n.val)
            go(n.right)
        go(root)
        return out
`);
  await setInput(page, '[1,2,3,4,null,5]', '[4,2,1,5,3]');
  await runAndWait(page);
  await expect(page.getByText('Passed.')).toBeVisible();
  await goToStep(page, Math.floor((await totalSteps(page)) / 2));
  await expect(page.locator('.tree-node')).toHaveCount(5);
  await expect(page.locator('.call').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/tree.png' });
});

test('a stack, a queue and a hash map get their own views', async ({ page }) => {
  await setCode(page, `class Solution:
    def mix(self, nums: List[int]) -> int:
        stack = []
        q = deque()
        seen = {}
        for x in nums:
            stack.append(x)
            q.append(x)
            seen[x] = x * 2
        q.popleft()
        stack.pop()
        return len(stack)
`);
  await setInput(page, '[3,1,2]', '2');
  await runAndWait(page);
  await goToStep(page, (await totalSteps(page)) - 1);
  await expect(page.locator('.frame', { hasText: 'Buckets' })).toBeVisible();
  await expect(page.locator('.bucket')).toHaveCount(3);
  await expect(page.locator('.queue-item')).toHaveCount(2);
  await expect(page.locator('.frame', { hasText: 'stack' }).locator('.stack-item')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/mix.png' });
});

test('index pointers follow an array', async ({ page }) => {
  await setCode(page, `class Solution:
    def search(self, nums: List[int], target: int) -> int:
        lo = 0
        hi = len(nums) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if nums[mid] == target:
                return mid
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
        return -1
`);
  await setInput(page, '[1,3,5,7,9,11]\n9', '4');
  await runAndWait(page);
  await goToStep(page, (await totalSteps(page)) - 3);
  await expect(page.locator('.pointer', { hasText: 'mid' })).toBeVisible();
  await page.screenshot({ path: 'test-results/pointers.png' });
});

for (const [lang, code] of [
  ['Java', `class Solution {
    Map<Integer, Integer> memo = new HashMap<>();
    public int fib(int n) {
        if (n <= 1) {
            return n;
        }
        if (memo.containsKey(n)) {
            return memo.get(n);
        }
        int r = fib(n - 1) + fib(n - 2);
        memo.put(n, r);
        return r;
    }
}
`],
  ['C++', `class Solution {
public:
    unordered_map<int, int> memo;
    int fib(int n) {
        if (n <= 1) {
            return n;
        }
        if (memo.count(n)) {
            return memo[n];
        }
        int r = fib(n - 1) + fib(n - 2);
        memo[n] = r;
        return r;
    }
};
`],
] as const) {
  test(`${lang}: class-level memo appears as buckets with cached calls marked`, async ({ page }) => {
    await page.getByRole('radio', { name: lang }).click();
    await setCode(page, code);
    await setInput(page, '6', '8');
    await runAndWait(page);
    await expect(page.getByText('Passed.')).toBeVisible();
    await goToStep(page, (await totalSteps(page)) - 3);
    await expect(page.locator('.bucket').first()).toBeVisible();
    expect(await page.locator('.call-hit').count()).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/memo-${lang === 'C++' ? 'cpp' : 'java'}.png` });
  });
}

test('landing page leads to the workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('went wrong');
  await page.screenshot({ path: 'test-results/landing.png' });
  await page.getByRole('link', { name: 'Open the debugger' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
});

test('nothing breaks at phone width', async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 375, height: 760 } })).newPage();
  await page.goto('/app');
  await runAndWait(page);
  await goToStep(page, 20);
  await page.screenshot({ path: 'test-results/phone.png', fullPage: true });
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.array-scroll, .dp-scroll, .tree-scroll, .queue-scroll, .cm-scroller')).slice(0, 5).map((e) => e.className));
  expect(wide).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
