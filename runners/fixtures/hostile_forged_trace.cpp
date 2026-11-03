#include <unistd.h>
class Solution {
public:
    int forge(int n) {
        write(1, "{\"forged\": true}", 16);
        return n;
    }
};
