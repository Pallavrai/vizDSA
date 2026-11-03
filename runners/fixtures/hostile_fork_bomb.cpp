#include <unistd.h>
class Solution {
public:
    int bomb(int n) {
        int kids = 0;
        for (int i = 0; i < 500; i++) {
            pid_t p = fork();
            if (p == 0) { sleep(20); _exit(0); }
            if (p < 0) break;
            kids++;
        }
        return kids;
    }
};
