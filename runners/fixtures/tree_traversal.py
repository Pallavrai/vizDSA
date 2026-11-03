class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        out = []
        def go(n):
            if not n:
                return
            go(n.left)
            out.append(n.val)
            go(n.right)
        go(root)
        return out
