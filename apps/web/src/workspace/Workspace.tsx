import { useMemo } from 'react';
import { MotionConfig } from 'motion/react';
import { ArrowLeft, CircleNotch, Play, WarningCircle } from '@phosphor-icons/react';
import type { Language } from '@vizdsa/trace';
import { currentRun, useWorkspace } from '../store/workspace.ts';
import { Visuals } from '../views/Visuals.tsx';
import { Editor } from './Editor.tsx';
import { TestCases } from './TestCases.tsx';
import { Timeline } from './Timeline.tsx';
import { usePlayback } from './usePlayback.ts';

const LANGUAGE_LABELS: Record<Language, string> = { python: 'Python', java: 'Java', cpp: 'C++' };

export default function Workspace() {
  usePlayback();
  const language = useWorkspace((s) => s.language);
  const code = useWorkspace((s) => s.codes[s.language]);
  const setCode = useWorkspace((s) => s.setCode);
  const setLanguage = useWorkspace((s) => s.setLanguage);
  const running = useWorkspace((s) => s.running);
  const run = useWorkspace((s) => s.run);
  const selectedRun = useWorkspace((s) => s.runs[s.selected]);
  const done = useWorkspace(currentRun);
  const step = useWorkspace((s) => s.step);
  const animate = useWorkspace((s) => s.animate);

  const stale = done !== null && done.code !== code;
  const trace = done?.trace;
  const currentLine = trace && !stale ? trace.steps[step]?.line ?? null : null;
  const atLastStep = trace ? step >= trace.steps.length - 1 : false;
  const errorLine = trace && !stale && trace.error?.line && (trace.steps.length === 0 || atLastStep) ? trace.error.line : null;
  const codeError = selectedRun?.state === 'error' && selectedRun.error.where === 'code' ? selectedRun.error.error : null;
  const transition = useMemo(() => (animate ? { type: 'spring' as const, stiffness: 520, damping: 38 } : { duration: 0 }), [animate]);

  return (
    <MotionConfig reducedMotion="user" transition={transition}>
      <div className="workspace">
        <a className="skip-link" href="#visuals">Skip to visuals</a>
        <header className="topbar">
          <a className="brand" href="/" aria-label="vizDSA home"><ArrowLeft size={14} aria-hidden /> viz<b>DSA</b></a>
          <div className="lang-switch" role="radiogroup" aria-label="Language">
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
              <button key={l} role="radio" aria-checked={language === l} className="lang" onClick={() => setLanguage(l)}>
                {LANGUAGE_LABELS[l]}
              </button>
            ))}
          </div>
          <button className="run-btn" onClick={() => void run()} disabled={running} title="Run (Cmd or Ctrl + Enter)">
            {running ? <CircleNotch className="spin" size={16} aria-hidden /> : <Play size={16} weight="fill" aria-hidden />}
            {running ? 'Running' : 'Run'}
          </button>
        </header>

        <main className="panes">
          <div className="pane pane-code">
            <Editor language={language} value={code} onChange={setCode} currentLine={currentLine} errorLine={errorLine} />
            {codeError && <p className="banner banner-error" role="alert"><WarningCircle size={16} weight="fill" aria-hidden /> {codeError}</p>}
            {stale && <p className="banner" role="status">The code changed. Run again to update the visuals.</p>}
            <TestCases />
          </div>
          <div className="pane pane-visual" id="visuals" tabIndex={-1}>
            <Visuals />
          </div>
        </main>

        <Timeline />
      </div>
    </MotionConfig>
  );
}
