class Solution {
public:
    unordered_map<int, int> memo;
    int fib(int n) {
        if (n <= 1) {
            return n;
        }
        if (memo.count(n)) {
            return memo[n];
        }
        int r = fib(n - 1) + fib(n - 2);
        memo[n] = r;
        return r;
    }
};
