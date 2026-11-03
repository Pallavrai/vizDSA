class Solution {
    public int bomb(int n) {
        int kids = 0;
        try {
            for (int i = 0; i < 2000; i++) {
                Thread t = new Thread(() -> { try { Thread.sleep(20000); } catch (Exception e) {} });
                t.setDaemon(true);
                t.start();
                kids++;
            }
        } catch (Throwable e) {
            return -1;
        }
        return kids;
    }
}
