import type { Language } from '@vizdsa/trace';
import { DriverError } from './error.ts';

export type Param = { name: string; type: string };
export type Signature = { method: string; params: Param[]; returnType: string };

function stripComments(language: Language, code: string): string {
  if (language === 'python') return code.replace(/^\s*#.*$/gm, '').replace(/("""|''')[\s\S]*?\1/g, '""');
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// Splits on commas that are not inside <> [] () brackets.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if ('<[('.includes(ch)) depth++;
    if ('>])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

function typedParams(text: string): Param[] {
  return splitTopLevel(text).map((part) => {
    const m = part.replace(/\s*=.*$/, '').match(/^(.*?)([A-Za-z_]\w*)$/s);
    if (!m) throw new DriverError(`Could not read the parameter "${part}".`, 'code');
    return { type: m[1].replace(/\bfinal\b|\bconst\b/g, '').trim(), name: m[2] };
  });
}

export function parseSignature(language: Language, source: string): Signature {
  const code = stripComments(language, source);
  const classAt = code.search(/\bclass\s+Solution\b/);
  if (classAt < 0) throw new DriverError('Could not find "class Solution" in your code.', 'code');
  const body = code.slice(classAt);

  if (language === 'python') {
    for (const m of body.matchAll(/^[ \t]+def\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^:\n]+))?:/gm)) {
      if (m[1].startsWith('_')) continue;
      const params = splitTopLevel(m[2])
        .filter((p) => p !== 'self' && !p.startsWith('*'))
        .map((p) => {
          const [name, type] = p.replace(/\s*=.*$/, '').split(/:(.*)/s);
          return { name: name.trim(), type: (type ?? '').trim() };
        });
      return { method: m[1], params, returnType: (m[3] ?? '').trim() };
    }
  } else if (language === 'java') {
    const m = body.match(/\bpublic\s+(?:static\s+|final\s+)*([\w<>[\],\s?.]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws[^{]*)?\{/);
    if (m) return { method: m[2], params: typedParams(m[3]), returnType: m[1].trim() };
  } else {
    const publicAt = body.indexOf('public:');
    const section = publicAt >= 0 ? body.slice(publicAt + 'public:'.length) : body;
    const pattern = /^\s*(?:(?:virtual|static|inline)\s+)*([\w:]+(?:<[^(){};]*>)?[\s*&]+)(\w+)\s*\(([^)]*)\)\s*(?:const\s*)?\{/gm;
    for (const m of section.matchAll(pattern)) {
      if (m[2] === 'Solution') continue;
      return { method: m[2], params: typedParams(m[3]), returnType: m[1].trim() };
    }
  }
  throw new DriverError('Could not find a public method in class Solution.', 'code');
}
