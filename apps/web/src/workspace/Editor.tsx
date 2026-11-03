import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Language } from '@vizdsa/trace';

const LANGUAGE: Record<Language, () => Extension> = { python, java, cpp };

const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.modifier], color: 'var(--syntax-keyword)' },
  { tag: [tags.string, tags.character], color: 'var(--syntax-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName))], color: 'var(--syntax-function)' },
  { tag: [tags.typeName, tags.className], color: 'var(--syntax-type)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', color: 'var(--text)', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
  '.cm-content': { caretColor: 'var(--write)', padding: '12px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--write)', borderLeftWidth: '2px' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: 'var(--text-muted)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'var(--selection) !important' },
  '.cm-currentStep': { background: 'var(--line-current)', boxShadow: 'inset 3px 0 0 var(--write)' },
  '.cm-errorLine': { background: 'var(--line-error)', boxShadow: 'inset 3px 0 0 var(--error)' },
});

const setMarks = StateEffect.define<{ current: number | null; error: number | null }>();

const marks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const ranges = [];
      const { current, error } = e.value;
      const total = tr.state.doc.lines;
      if (error && error <= total) ranges.push(Decoration.line({ class: 'cm-errorLine' }).range(tr.state.doc.line(error).from));
      if (current && current !== error && current <= total) ranges.push(Decoration.line({ class: 'cm-currentStep' }).range(tr.state.doc.line(current).from));
      ranges.sort((a, b) => a.from - b.from);
      next = Decoration.set(ranges);
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

type Props = { language: Language; value: string; onChange(value: string): void; currentLine: number | null; errorLine: number | null };

export function Editor({ language, value, onChange, currentLine, errorLine }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageConf = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          indentOnInput(),
          bracketMatching(),
          indentUnit.of('    '),
          // Escape then Tab leaves the editor, so the Tab key is not a keyboard trap.
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          syntaxHighlighting(highlightStyle),
          theme,
          marks,
          languageConf.current.of(LANGUAGE[language]()),
          EditorView.contentAttributes.of({ 'aria-label': 'Solution code' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = instance;
    return () => instance.destroy();
    // Created once; language and value changes are pushed in by the effects below.
  }, []);

  useEffect(() => {
    const v = view.current!;
    const effects = languageConf.current.reconfigure(LANGUAGE[language]());
    const changes = v.state.doc.toString() === value ? undefined : { from: 0, to: v.state.doc.length, insert: value };
    v.dispatch({ effects, changes });
  }, [language, value]);

  useEffect(() => {
    const v = view.current!;
    const scrollLine = currentLine ?? errorLine;
    const effects: StateEffect<unknown>[] = [setMarks.of({ current: currentLine, error: errorLine })];
    if (scrollLine && scrollLine <= v.state.doc.lines) effects.push(EditorView.scrollIntoView(v.state.doc.line(scrollLine).from, { y: 'nearest', yMargin: 48 }));
    v.dispatch({ effects });
  }, [currentLine, errorLine]);

  return <div className="editor" ref={host} />;
}
