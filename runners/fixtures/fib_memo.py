class Solution:
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
