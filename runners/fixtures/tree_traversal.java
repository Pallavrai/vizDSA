class Solution {
    public List<Integer> inorderTraversal(TreeNode root) {
        List<Integer> out = new ArrayList<>();
        go(root, out);
        return out;
    }
    private void go(TreeNode n, List<Integer> out) {
        if (n == null) {
            return;
        }
        go(n.left, out);
        out.add(n.val);
        go(n.right, out);
    }
}
