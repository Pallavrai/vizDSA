import socket
class Solution:
    def net(self, n: int) -> str:
        try:
            socket.create_connection(("1.1.1.1", 53), timeout=2)
            return "connected"
        except OSError:
            return "blocked"
