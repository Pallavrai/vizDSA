import { DriverError } from './error.ts';
import { parseSignature } from './signature.ts';
import { parseTestCase } from './testCase.ts';

function bad(value: unknown, type: string): DriverError {
  return new DriverError(`The test case value ${JSON.stringify(value)} does not fit the parameter type ${type}.`, 'testCase');
}

function baseType(type: string): string {
  return type.replace(/\bconst\b/g, '').replace(/&/g, '').replace(/\s+/g, ' ').replace(/std::/g, '').trim();
}

function literal(value: unknown, rawType: string): string {
  const type = baseType(rawType).replace(/\s*\*/g, '*');
  const vector = type.match(/^vector<\s*(.+?)\s*>$/);
  if (vector) {
    if (!Array.isArray(value)) throw bad(value, type);
    return `{${value.map((v) => literal(v, vector[1])).join(',')}}`;
  }
  if (type === 'ListNode*' || type === 'TreeNode*') {
    if (!Array.isArray(value)) throw bad(value, type);
    const items = value.map((v) => (v === null ? 'nullopt' : String(v))).join(',');
    return `${type === 'ListNode*' ? 'vizListNode' : 'vizTree'}({${items}})`;
  }
  switch (type) {
    case 'int': case 'short': case 'unsigned': case 'unsigned int': case 'size_t':
      if (!Number.isInteger(value)) throw bad(value, type);
      return String(value);
    case 'long': case 'long long': case 'long long int': case 'int64_t':
      if (!Number.isInteger(value)) throw bad(value, type);
      return `${value}LL`;
    case 'double': case 'float':
      if (typeof value !== 'number') throw bad(value, type);
      return Number.isInteger(value) ? `${value}.0` : String(value);
    case 'bool':
      if (typeof value !== 'boolean') throw bad(value, type);
      return String(value);
    case 'char':
      if (typeof value !== 'string' || value.length !== 1) throw bad(value, type);
      return `'${value === "'" || value === '\\' ? '\\' : ''}${value}'`;
    case 'string':
      if (typeof value !== 'string') throw bad(value, type);
      return JSON.stringify(value);
  }
  throw new DriverError(`The parameter type ${type} is not supported yet.`, 'code');
}

export function cppDriver(code: string, input: string) {
  const sig = parseSignature('cpp', code);
  const values = parseTestCase(input, sig.params.length);
  const decls = sig.params.map((p, i) => `${baseType(p.type)} a${i} = ${literal(values[i], p.type)};`);
  const args = sig.params.map((_, i) => `a${i}`).join(',');
  const isVoid = baseType(sig.returnType) === 'void';
  const body = isVoid
    ? `s.${sig.method}(${args});\n  ${args ? 'vizReport(a0);' : 'vizReportNull();'}`
    : `auto r = s.${sig.method}(${args});\n  vizReport(r);`;
  return {
    method: sig.method,
    main: `int main() {\n  ${decls.join('\n  ')}\n  Solution s;\n  ${body}\n  return 0;\n}\n`,
  };
}
