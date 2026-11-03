import type { HeapObject, Language, Value } from '@vizdsa/trace';
import { isRef, type TraceState } from './traceStore.ts';

export type Cell = { ref: string; path: Array<number | string> };
export type Pointer = { ref: string; name: string };
export type Accesses = { reads: Cell[]; writes: Cell[]; pointers: Pointer[] };

type Token = { kind: 'name' | 'num' | 'str' | 'op'; text: string };

const TOKEN = /\s*(?:((?:self\.|this\.|this->)?[A-Za-z_]\w*)|(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\/\/|<<|>>|->|::|[-+*/%&|^<>=!]=|==|&&|\|\||[-+*/%()[\]{}.,;:=<>!&|^?~]))/y;

function tokenize(line: string, language: Language): Token[] {
  // Comments are dropped first so `#` and `//` text cannot look like code.
  const code = language === 'python' ? line.replace(/#.*$/, '') : line.replace(/\/\/.*$/, '');
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN.lastIndex < code.length && (m = TOKEN.exec(code))) {
    if (m[1]) tokens.push({ kind: 'name', text: m[1] });
    else if (m[2]) tokens.push({ kind: 'num', text: m[2] });
    else if (m[3]) tokens.push({ kind: 'str', text: m[3].slice(1, -1) });
    else if (m[4]) tokens.push({ kind: 'op', text: m[4] });
  }
  return tokens;
}

export function lookupVar(name: string, state: TraceState): Value | undefined {
  const frame = state.frames.at(-1);
  if (!frame) return undefined;
  const field = (fieldName: string) => {
    for (const self of [frame.vars.self, frame.vars.this]) {
      if (isRef(self)) {
        const obj = state.heap.get(self.ref);
        if (obj?.kind === 'object') return (obj.contents as Record<string, Value>)[fieldName];
      }
    }
    return undefined;
  };
  const qualified = name.match(/^(?:self\.|this\.|this->)(.+)$/);
  if (qualified) return field(qualified[1]);
  return name in frame.vars ? frame.vars[name] : field(name);
}

function element(obj: HeapObject, key: number | string, language: Language): { value: Value | undefined; key: number | string } | null {
  if (obj.kind === 'map') {
    const entry = (obj.contents as [Value, Value][]).find(([k]) => k === key);
    return { value: entry?.[1], key };
  }
  if (obj.kind === 'object') return null;
  if (typeof key !== 'number' || !Number.isInteger(key)) return null;
  const items = obj.contents as Value[];
  const index = key < 0 && language === 'python' ? items.length + key : key;
  if (index < 0 || index >= items.length) return null;
  return { value: items[index], key: index };
}

class Evaluator {
  constructor(private tokens: Token[], private state: TraceState, private language: Language) {}

  // A small expression evaluator: integers, variables and arithmetic. It never runs student code.
  evaluate(start: number, end: number): number | string | undefined {
    let i = start;
    const t = this.tokens;
    const primary = (): number | string | undefined => {
      const tok = t[i];
      if (i >= end || !tok) return undefined;
      if (tok.kind === 'num') { i++; return Number(tok.text); }
      if (tok.kind === 'str') { i++; return tok.text; }
      if (tok.text === '-' ) { i++; const v = primary(); return typeof v === 'number' ? -v : undefined; }
      if (tok.text === '(') {
        i++;
        const v = additive();
        if (t[i]?.text !== ')') return undefined;
        i++;
        return v;
      }
      if (tok.kind === 'name') {
        const walked = this.walk(i, end);
        if (!walked) return undefined;
        i = walked.next;
        return typeof walked.value === 'number' || typeof walked.value === 'string' ? walked.value : undefined;
      }
      return undefined;
    };
    const multiplicative = (): number | string | undefined => {
      let left = primary();
      while (i < end && ['*', '/', '//', '%'].includes(t[i].text)) {
        const op = t[i++].text;
        const right = primary();
        if (typeof left !== 'number' || typeof right !== 'number') return undefined;
        if (op === '*') left *= right;
        else if (op === '%') { if (right === 0) return undefined; left = ((left % right) + (this.language === 'python' ? right : 0)) % right; }
        else { if (right === 0) return undefined; left = op === '/' && this.language !== 'python' ? Math.trunc(left / right) : Math.floor(left / right); }
      }
      return left;
    };
    function additive(): number | string | undefined {
      let left = multiplicative();
      while (i < end && (t[i].text === '+' || t[i].text === '-')) {
        const op = t[i++].text;
        const right = multiplicative();
        if (typeof left !== 'number' || typeof right !== 'number') return undefined;
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }
    const value = additive();
    return i === end ? value : undefined;
  }

  private matching(open: number): number {
    const pair = this.tokens[open].text === '[' ? ']' : ')';
    const self = this.tokens[open].text;
    let depth = 0;
    for (let i = open; i < this.tokens.length; i++) {
      if (this.tokens[i].text === self) depth++;
      if (this.tokens[i].text === pair && --depth === 0) return i;
    }
    return -1;
  }

  // Follows `name[a][b]` or `name.get(a)` from a name token. Null means it could not be resolved.
  walk(start: number, end = this.tokens.length): { cell: Cell | null; value: Value | undefined; next: number; pointerNames: string[] } | null {
    const t = this.tokens;
    let value = lookupVar(t[start].text, this.state);
    if (value === undefined) return null;
    const root = isRef(value) ? value.ref : null;
    const path: Array<number | string> = [];
    const pointerNames: string[] = [];
    let i = start + 1;
    while (i < end) {
      let open = -1;
      let keepValue = false;
      if (t[i]?.text === '[') open = i;
      else if (t[i]?.text === '.' && t[i + 2]?.text === '(' && ['get', 'at', 'containsKey', 'count', 'find', 'contains', 'has'].includes(t[i + 1]?.text)) {
        open = i + 2;
        keepValue = t[i + 1].text !== 'get' && t[i + 1].text !== 'at';
      } else break;
      const close = this.matching(open);
      if (close < 0) return null;
      const key = this.evaluate(open + 1, close);
      if (key === undefined || !isRef(value)) return null;
      const obj = this.state.heap.get(value.ref);
      if (!obj) return null;
      if (obj.kind === 'set') {
        path.push(key);
        i = close + 1;
        value = undefined;
        break;
      }
      const el = element(obj, key, this.language);
      if (!el) return null;
      if (close === open + 2 && t[open + 1].kind === 'name' && typeof key === 'number') pointerNames.push(t[open + 1].text);
      path.push(el.key);
      value = keepValue ? undefined : el.value;
      i = close + 1;
      if (keepValue) break;
    }
    return { cell: root && path.length ? { ref: root, path } : null, value, next: i, pointerNames };
  }
}

const NON_ASSIGNING = new Set(['for', 'while', 'if', 'elif', 'return', 'assert', 'else']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=']);

// Best guess from one line of source. Anything not fully resolved is dropped: a missing arrow is fine, a wrong one misleads.
export function findAccesses(line: string, state: TraceState, language: Language): Accesses {
  const tokens = tokenize(line, language);
  const out: Accesses = { reads: [], writes: [], pointers: [] };
  const evaluator = new Evaluator(tokens, state, language);

  let assignAt = -1;
  let compound = false;
  if (!NON_ASSIGNING.has(tokens[0]?.text)) {
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const text = tokens[i].text;
      if ('([{'.includes(text)) depth++;
      if (')]}'.includes(text)) depth--;
      if (depth === 0 && (text === '=' || COMPOUND.has(text))) {
        assignAt = i;
        compound = text !== '=';
        break;
      }
    }
  }

  let openBrackets = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.text === '[' || tok.text === '(') openBrackets++;
    if (tok.text === ']' || tok.text === ')') openBrackets--;
    if (tok.kind === 'name' && tokens[i - 1]?.text !== '.') {
      if (tok.text === 'in' && language === 'python' && tokens[0]?.text !== 'for') {
        const target = tokens[i + 1]?.kind === 'name' ? lookupVar(tokens[i + 1].text, state) : undefined;
        if (isRef(target)) {
          const obj = state.heap.get(target.ref);
          if (obj && (obj.kind === 'map' || obj.kind === 'set')) out.reads.push({ ref: target.ref, path: [] });
        }
        continue;
      }
      const walked = evaluator.walk(i);
      if (walked?.cell) {
        if (i < assignAt && openBrackets === 0) {
          out.writes.push(walked.cell);
          if (compound) out.reads.push(walked.cell);
        } else {
          out.reads.push(walked.cell);
        }
        for (const name of walked.pointerNames) out.pointers.push({ ref: walked.cell.ref, name });
      }
    }
  }
  return out;
}
