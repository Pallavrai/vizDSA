class Solution {
public:
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> out;
        go(root, out);
        return out;
    }
    void go(TreeNode* n, vector<int>& out) {
        if (!n) {
            return;
        }
        go(n->left, out);
        out.push_back(n->val);
        go(n->right, out);
    }
};
