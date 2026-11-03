import { CheckCircle, CircleNotch, Plus, Trash, WarningCircle, XCircle } from '@phosphor-icons/react';
import { MAX_TEST_CASES, useWorkspace, type Run, type TestCase } from '../store/workspace.ts';
import { resultText, verdict } from '../trace/testResult.ts';

function StatusIcon({ run, test }: { run: Run | undefined; test: TestCase }) {
  if (!run) return null;
  if (run.state === 'running') return <CircleNotch className="spin" size={14} aria-label="running" />;
  if (run.state === 'error') return <WarningCircle className="tone-error" size={14} weight="fill" aria-label="could not run" />;
  if (run.trace.status !== 'ok') return <WarningCircle className="tone-error" size={14} weight="fill" aria-label="stopped early" />;
  const v = verdict(test.expected, run.trace.result);
  if (v === 'pass') return <CheckCircle className="tone-write" size={14} weight="fill" aria-label="passed" />;
  if (v === 'fail') return <XCircle className="tone-error" size={14} weight="fill" aria-label="failed" />;
  return <CheckCircle className="tone-muted" size={14} aria-label="ran" />;
}

export function TestCases() {
  const testCases = useWorkspace((s) => s.testCases);
  const selected = useWorkspace((s) => s.selected);
  const runs = useWorkspace((s) => s.runs);
  const select = useWorkspace((s) => s.select);
  const add = useWorkspace((s) => s.addTestCase);
  const remove = useWorkspace((s) => s.removeTestCase);
  const update = useWorkspace((s) => s.updateTestCase);

  const test = testCases.find((t) => t.id === selected) ?? testCases[0];
  const run = runs[test.id];
  const inputError = run?.state === 'error' && run.error.where === 'testCase' ? run.error.error : null;
  const done = run?.state === 'done' ? run : null;
  const v = done && done.trace.status === 'ok' ? verdict(test.expected, done.trace.result) : 'none';

  return (
    <section className="tests" aria-label="Test cases">
      <div className="tests-tabs" role="tablist" aria-label="Test case">
        {testCases.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={t.id === test.id} className="test-tab" onClick={() => select(t.id)}>
            <StatusIcon run={runs[t.id]} test={t} />
            Case {i + 1}
          </button>
        ))}
        <button className="icon-btn" onClick={add} disabled={testCases.length >= MAX_TEST_CASES} aria-label="Add test case" title="Add test case">
          <Plus size={14} aria-hidden />
        </button>
        {testCases.length > 1 && (
          <button className="icon-btn push-right" onClick={() => remove(test.id)} aria-label="Remove this test case" title="Remove this test case">
            <Trash size={14} aria-hidden />
          </button>
        )}
      </div>
      <div className="tests-fields">
        <label className="field">
          <span className="eyebrow">Input, one parameter per line</span>
          <textarea
            value={test.input}
            onChange={(e) => update(test.id, { input: e.target.value })}
            rows={3}
            spellCheck={false}
            placeholder={'[2,7,11,15]\n9'}
            aria-invalid={!!inputError}
            aria-describedby={inputError ? 'test-error' : undefined}
          />
        </label>
        <label className="field">
          <span className="eyebrow">Expected output (optional)</span>
          <textarea value={test.expected} onChange={(e) => update(test.id, { expected: e.target.value })} rows={3} spellCheck={false} placeholder="[0,1]" />
        </label>
      </div>
      {inputError && <p id="test-error" className="field-error" role="alert">{inputError}</p>}
      {done && done.trace.status === 'ok' && (
        <p className={`result-line verdict-${v}`} role="status">
          {v === 'pass' && <strong>Passed.</strong>}
          {v === 'fail' && <strong>Failed.</strong>}
          <span> Output <code>{resultText(done.trace.result)}</code></span>
          {v === 'fail' && <span>, expected <code>{test.expected.trim()}</code></span>}
        </p>
      )}
    </section>
  );
}
