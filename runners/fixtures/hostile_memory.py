class Solution:
    def hog(self, n: int) -> int:
        chunks = []
        while True:
            chunks.append(bytearray(50 * 1024 * 1024))
