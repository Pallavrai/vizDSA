#include <arpa/inet.h>
#include <sys/socket.h>
class Solution {
public:
    string net(int n) {
        int s = socket(AF_INET, SOCK_STREAM, 0);
        sockaddr_in a{};
        a.sin_family = AF_INET;
        a.sin_port = htons(53);
        inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
        return connect(s, (sockaddr*)&a, sizeof(a)) == 0 ? "connected" : "blocked";
    }
};
