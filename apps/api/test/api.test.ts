import { describe, expect, it } from 'vitest';
import { cppDriver } from '../src/drivers/cpp.ts';
import { DriverError } from '../src/drivers/error.ts';
import { javaDriver } from '../src/drivers/java.ts';
import { pythonDriver } from '../src/drivers/python.ts';
import { parseSignature } from '../src/drivers/signature.ts';
import { parseTestCase } from '../src/drivers/testCase.ts';
import { runLimits } from '../src/limits.ts';
import { createQueue, DailyLimitReached, QueueFull } from '../src/queue.ts';
import { dockerArgs, LanguageDisabled, runtimeFor } from '../src/sandbox.ts';
import { validateTrace } from '../src/validateTrace.ts';

describe('parseSignature', () => {
  it('reads Python past LeetCode\'s commented ListNode block', () => {
    const code = `# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
class Solution:
    def helper_(self): pass
    def __init__(self):
        pass
`;
    expect(parseSignature('python', code).method).toBe('helper_');
    const sig = parseSignature('python', `class Solution:\n    def f(\n        self,\n        nums: List[List[int]],\n        k: int = 3,\n    ) -> Optional[ListNode]:\n        pass\n`);
    expect(sig).toEqual({ method: 'f', params: [{ name: 'nums', type: 'List[List[int]]' }, { name: 'k', type: 'int' }], returnType: 'Optional[ListNode]' });
  });

  it('reads Java generics, arrays and multi-line signatures', () => {
    const code = `/**\n * public class ListNode { public int val; }\n */\nclass Solution {\n  private int x;\n  public List<List<Integer>> f(int[][] grid,\n      final List<String> words) {\n    return null;\n  }\n}`;
    expect(parseSignature('java', code)).toEqual({ method: 'f', params: [{ type: 'int[][]', name: 'grid' }, { type: 'List<String>', name: 'words' }], returnType: 'List<List<Integer>>' });
  });

  it('reads C++ refs and pointers and skips the constructor', () => {
    const code = `class Solution {\npublic:\n  Solution() {}\n  vector<vector<int>> f(vector<int>& nums, const string &s, TreeNode* root) {\n    return {};\n  }\n};`;
    expect(parseSignature('cpp', code)).toEqual({
      method: 'f',
      params: [{ type: 'vector<int>&', name: 'nums' }, { type: 'string &', name: 's' }, { type: 'TreeNode*', name: 'root' }],
      returnType: 'vector<vector<int>>',
    });
  });

  it('gives a clear error when there is no Solution class', () => {
    expect(() => parseSignature('python', 'def f(): pass')).toThrow(/class Solution/);
  });
});

describe('parseTestCase', () => {
  it('parses one JSON value per line and ignores blank lines', () => {
    expect(parseTestCase('[2,7]\n\n9\n', 2)).toEqual([[2, 7], 9]);
  });
  it('explains a wrong line count', () => {
    expect(() => parseTestCase('[1]', 2)).toThrow(/takes 2 parameters.*1 line/);
  });
  it('explains an invalid value', () => {
    expect(() => parseTestCase('[1,', 1)).toThrow(DriverError);
  });
});

describe('drivers', () => {
  it('marks Python list and tree parameters and void methods', () => {
    const d = pythonDriver(`class Solution:\n    def f(self, h: Optional[ListNode], t: TreeNode, n: int) -> None:\n        pass\n`, '[1]\n[2]\n3');
    expect(d.returnsVoid).toBe(true);
    expect(d.args.map((a) => a.convert)).toEqual(['list', 'tree', null]);
  });
  it('builds Java literals', () => {
    const { main } = javaDriver(`class Solution {\n  public int f(int[][] a, List<String> b, char c, long d, TreeNode t) { return 0; }\n}`, '[[1],[2]]\n["x"]\n"q"\n5\n[1,null,2]');
    expect(main).toContain('new int[][]{new int[]{1},new int[]{2}}');
    expect(main).toContain('VizSupport.list("x")');
    expect(main).toContain("'q'");
    expect(main).toContain('5L');
    expect(main).toContain('VizSupport.tree(new Integer[]{1,null,2})');
  });
  it('builds C++ literals and reports the first argument for void methods', () => {
    const { main } = cppDriver(`class Solution {\npublic:\n  void f(vector<int>& a, vector<string> b, ListNode* h) {\n  }\n};`, '[1,2]\n["x"]\n[1]');
    expect(main).toContain('vector<int> a0 = {1,2};');
    expect(main).toContain('vector<string> a1 = {"x"};');
    expect(main).toContain('vizListNode({1})');
    expect(main).toContain('vizReport(a0);');
  });
  it('rejects a value that does not fit the type', () => {
    expect(() => javaDriver(`class Solution {\n  public int f(int a) { return 0; }\n}`, '"x"')).toThrow(/does not fit/);
    expect(() => cppDriver(`class Solution {\npublic:\n  int f(int a) {\n    return 0;\n  }\n};`, '[1]')).toThrow(/does not fit/);
  });
  it('cannot be injected through test case strings', () => {
    const { main } = javaDriver(`class Solution {\n  public int f(String a) { return 0; }\n}`, '"\\"; System.exit(1); //"');
    expect(main).toContain('\\"; System.exit(1); //');
    expect(main).not.toMatch(/= "";/);
  });
});

describe('queue', () => {
  it('limits active and queued jobs and frees slots', async () => {
    const q = createQueue(1, 1, 100);
    let release!: () => void;
    const first = q.run(() => new Promise<string>((r) => { release = () => r('a'); }));
    const second = q.run(async () => 'b');
    await expect(q.run(async () => 'c')).rejects.toBeInstanceOf(QueueFull);
    release();
    expect(await first).toBe('a');
    expect(await second).toBe('b');
    expect(await q.run(async () => 'd')).toBe('d');
  });
  it('frees the slot when a job throws', async () => {
    const q = createQueue(1, 0, 100);
    await expect(q.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await q.run(async () => 'ok')).toBe('ok');
  });
  it('enforces and resets the daily limit', async () => {
    let t = 0;
    const q = createQueue(1, 1, 1, () => t);
    await q.run(async () => 1);
    await expect(q.run(async () => 2)).rejects.toBeInstanceOf(DailyLimitReached);
    t = 86_400_000;
    expect(await q.run(async () => 3)).toBe(3);
  });
});

describe('runLimits', () => {
  it('stays limited unless explicitly turned off', () => {
    expect(runLimits({}).perHourPerIp).toBe(60);
    expect(runLimits({}).perDay).toBe(500);
    expect(runLimits({ RUN_LIMITS: 'on' }).perHourPerIp).toBe(60);
  });
  it('removes run limits only for RUN_LIMITS=off', () => {
    expect(runLimits({ RUN_LIMITS: 'off' })).toEqual({ perHourPerIp: null, perDay: Infinity, maxQueued: Infinity });
  });
});

describe('validateTrace', () => {
  it('rejects output that is not a valid trace', () => {
    expect(validateTrace('python', 'nonsense').status).toBe('runtime_error');
    expect(validateTrace('python', '{"forged":true}').error?.message).toMatch(/could not be recorded/);
    expect(validateTrace('python', JSON.stringify({ version: 1, language: 'java', status: 'ok', error: null, stdout: '', steps: [] })).status).toBe('runtime_error');
  });
  it('accepts a valid trace', () => {
    expect(validateTrace('python', JSON.stringify({ version: 1, language: 'python', status: 'ok', result: 3, error: null, stdout: '', steps: [] })).result).toBe(3);
  });
});

describe('sandbox settings', () => {
  it('defaults Python and Java to gVisor', () => {
    expect(runtimeFor('python', {})).toBe('runsc');
    expect(runtimeFor('java', {})).toBe('runsc');
  });
  it('refuses C++ unless explicitly enabled', () => {
    expect(() => runtimeFor('cpp', {})).toThrow(LanguageDisabled);
    expect(runtimeFor('cpp', { SANDBOX_RUNTIME_CPP: 'runc' })).toBe('runc');
  });
  it('always isolates the container', () => {
    const args = dockerArgs('python', 'n', 'runsc');
    for (const flag of ['--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--runtime=runsc']) expect(args).toContain(flag);
    expect(args).not.toContain('--privileged');
  });
});
