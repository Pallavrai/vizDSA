class Solution:
    def deep(self, n: int) -> int:
        return self.deep(n + 1)
