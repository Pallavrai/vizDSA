class Solution {
public:
    int deep(int n) {
        return deep(n + 1) + 1;
    }
};
