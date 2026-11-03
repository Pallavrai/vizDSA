#pragma once
#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

inline ListNode *vizListNode(vector<optional<int>> values) {
    ListNode dummy, *tail = &dummy;
    for (auto &v : values) { tail->next = new ListNode(*v); tail = tail->next; }
    return dummy.next;
}

inline TreeNode *vizTree(vector<optional<int>> values) {
    if (values.empty() || !values[0]) return nullptr;
    TreeNode *root = new TreeNode(*values[0]);
    deque<TreeNode *> q{root};
    size_t i = 1;
    while (!q.empty() && i < values.size()) {
        TreeNode *n = q.front(); q.pop_front();
        if (i < values.size() && values[i]) { n->left = new TreeNode(*values[i]); q.push_back(n->left); }
        i++;
        if (i < values.size() && values[i]) { n->right = new TreeNode(*values[i]); q.push_back(n->right); }
        i++;
    }
    return root;
}

inline void vizJson(ostream &o, const string &s) {
    o << '"';
    for (char c : s) {
        if (c == '"' || c == '\\') o << '\\' << c;
        else if ((unsigned char)c < 32) { char b[8]; snprintf(b, 8, "\\u%04x", c); o << b; }
        else o << c;
    }
    o << '"';
}
inline void vizJson(ostream &o, const char *s) { vizJson(o, string(s)); }
inline void vizJson(ostream &o, bool v) { o << (v ? "true" : "false"); }
inline void vizJson(ostream &o, char v) { vizJson(o, string(1, v)); }
template <class T, enable_if_t<is_integral_v<T>, int> = 0> void vizJson(ostream &o, T v) { o << +v; }
inline void vizJson(ostream &o, double v) {
    if (isfinite(v)) o << setprecision(17) << v; else vizJson(o, string(isnan(v) ? "nan" : v > 0 ? "inf" : "-inf"));
}
inline void vizJson(ostream &o, float v) { vizJson(o, (double)v); }
inline void vizJson(ostream &o, ListNode *n) {
    o << '['; set<ListNode *> seen; bool first = true;
    while (n && seen.insert(n).second && seen.size() < 2000) { if (!first) o << ','; first = false; o << n->val; n = n->next; }
    o << ']';
}
inline void vizJson(ostream &o, TreeNode *t) {
    vector<string> out; deque<TreeNode *> q{t};
    while (!q.empty() && out.size() < 2000) {
        TreeNode *n = q.front(); q.pop_front();
        if (!n) { out.push_back("null"); continue; }
        out.push_back(to_string(n->val)); q.push_back(n->left); q.push_back(n->right);
    }
    while (!out.empty() && out.back() == "null") out.pop_back();
    o << '[';
    for (size_t i = 0; i < out.size(); i++) { if (i) o << ','; o << out[i]; }
    o << ']';
}
template <class A, class B> void vizJson(ostream &o, const pair<A, B> &p);
template <class T> void vizJson(ostream &o, const vector<T> &v);
template <class T> void vizJson(ostream &o, const vector<T> &v) {
    o << '[';
    bool first = true;
    for (auto x : v) { if (!first) o << ','; first = false; vizJson(o, (decltype(x))x); }
    o << ']';
}
template <class A, class B> void vizJson(ostream &o, const pair<A, B> &p) {
    o << '['; vizJson(o, p.first); o << ','; vizJson(o, p.second); o << ']';
}
template <class T> void vizReport(const T &v) { ofstream f("/tmp/w/result.json"); vizJson(f, v); }
inline void vizReport(ListNode *v) { ofstream f("/tmp/w/result.json"); vizJson(f, v); }
inline void vizReport(TreeNode *v) { ofstream f("/tmp/w/result.json"); vizJson(f, v); }
inline void vizReportNull() { ofstream f("/tmp/w/result.json"); f << "null"; }
