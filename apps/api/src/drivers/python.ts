import { parseSignature } from './signature.ts';
import { parseTestCase } from './testCase.ts';

export function pythonDriver(code: string, input: string) {
  const sig = parseSignature('python', code);
  const values = parseTestCase(input, sig.params.length);
  return {
    method: sig.method,
    returnsVoid: /^None$/.test(sig.returnType),
    args: values.map((value, i) => {
      const type = sig.params[i].type;
      return { value, convert: /ListNode/.test(type) ? 'list' : /TreeNode/.test(type) ? 'tree' : null };
    }),
  };
}
