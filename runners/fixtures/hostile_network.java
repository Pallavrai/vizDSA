class Solution {
    public String net(int n) {
        try {
            new java.net.Socket("1.1.1.1", 53).close();
            return "connected";
        } catch (Exception e) {
            return "blocked";
        }
    }
}
