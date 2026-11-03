import type { Language } from '@vizdsa/trace';

export const SAMPLE_CODE: Record<Language, string> = {
  python: `class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        dp = [amount + 1] * (amount + 1)
        dp[0] = 0
        for i in range(1, amount + 1):
            for c in coins:
                if c <= i:
                    dp[i] = min(dp[i], dp[i - c] + 1)
        return dp[amount] if dp[amount] <= amount else -1
`,
  java: `class Solution {
    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++) {
            for (int c : coins) {
                if (c <= i) {
                    dp[i] = Math.min(dp[i], dp[i - c] + 1);
                }
            }
        }
        return dp[amount] <= amount ? dp[amount] : -1;
    }
}
`,
  cpp: `class Solution {
public:
    int coinChange(vector<int>& coins, int amount) {
        vector<int> dp(amount + 1, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++) {
            for (int c : coins) {
                if (c <= i) {
                    dp[i] = min(dp[i], dp[i - c] + 1);
                }
            }
        }
        return dp[amount] <= amount ? dp[amount] : -1;
    }
};
`,
};

export const SAMPLE_TEST = { input: '[1,2,5]\n6', expected: '2' };
