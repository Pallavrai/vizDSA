import { DriverError } from './error.ts';
import { parseSignature } from './signature.ts';
import { parseTestCase } from './testCase.ts';

function bad(value: unknown, type: string): DriverError {
  return new DriverError(`The test case value ${JSON.stringify(value)} does not fit the parameter type ${type}.`, 'testCase');
}

function literal(value: unknown, rawType: string): string {
  const type = rawType.replace(/\s+/g, '');
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) throw bad(value, type);
    const inner = type.slice(0, -2);
    return `new ${type}{${value.map((v) => literal(v, inner)).join(',')}}`;
  }
  const generic = type.match(/^(?:List|ArrayList|Collection)<(.+)>$/);
  if (generic) {
    if (!Array.isArray(value)) throw bad(value, type);
    return `VizSupport.list(${value.map((v) => literal(v, generic[1])).join(',')})`;
  }
  if (type === 'ListNode' || type === 'TreeNode') {
    if (!Array.isArray(value)) throw bad(value, type);
    return `VizSupport.${type === 'ListNode' ? 'listNode' : 'tree'}(new Integer[]{${value.map((v) => (v === null ? 'null' : String(v))).join(',')}})`;
  }
  if (value === null) return 'null';
  switch (type) {
    case 'int': case 'Integer': case 'short': case 'byte':
      if (!Number.isInteger(value)) throw bad(value, type);
      return String(value);
    case 'long': case 'Long':
      if (!Number.isInteger(value)) throw bad(value, type);
      return `${value}L`;
    case 'double': case 'Double': case 'float': case 'Float':
      if (typeof value !== 'number') throw bad(value, type);
      return type.toLowerCase() === 'float' ? `${value}f` : `${value}d`;
    case 'boolean': case 'Boolean':
      if (typeof value !== 'boolean') throw bad(value, type);
      return String(value);
    case 'char': case 'Character':
      if (typeof value !== 'string' || value.length !== 1) throw bad(value, type);
      return `'${value === "'" || value === '\\' ? '\\' : ''}${value}'`;
    case 'String':
      if (typeof value !== 'string') throw bad(value, type);
      return JSON.stringify(value);
  }
  throw new DriverError(`The parameter type ${type} is not supported yet.`, 'code');
}

export function javaDriver(code: string, input: string) {
  const sig = parseSignature('java', code);
  const values = parseTestCase(input, sig.params.length);
  const decls = sig.params.map((p, i) => `${p.type} a${i} = ${literal(values[i], p.type)};`);
  const args = sig.params.map((_, i) => `a${i}`).join(',');
  const isVoid = sig.returnType === 'void';
  const report = isVoid ? (args ? 'VizSupport.report(a0);' : 'VizSupport.report(null);') : `VizSupport.report(r);`;
  const call = isVoid ? `s.${sig.method}(${args});` : `${sig.returnType} r = s.${sig.method}(${args});`;
  return {
    method: sig.method,
    main: `import java.util.*;\npublic class Main {\n  public static void main(String[] argv) throws Exception {\n    ${decls.join('\n    ')}\n    Solution s = new Solution();\n    ${call}\n    ${report}\n  }\n}\n`,
  };
}
