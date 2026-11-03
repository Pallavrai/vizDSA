import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Pause, Play, SkipBack } from '@phosphor-icons/react';
import type { Trace } from '@vizdsa/trace';
import { currentRun, SPEEDS, useWorkspace } from '../store/workspace.ts';

// The strip shows the run's shape: call depth as a skyline, with writes and errors marked.
function drawStrip(canvas: HTMLCanvasElement, trace: Trace) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx || width === 0) return;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);
  const css = getComputedStyle(canvas);
  const color = (name: string) => css.getPropertyValue(name).trim();

  const total = trace.steps.length;
  const bins = Math.max(1, Math.min(width, total));
  const binWidth = width / bins;
  const depthAt = new Array<number>(bins).fill(0);
  const wrote = new Array<boolean>(bins).fill(false);
  const calls: number[] = [];
  let depth = 0;
  let maxDepth = 1;
  trace.steps.forEach((step, i) => {
    const b = Math.min(bins - 1, Math.floor((i * bins) / total));
    if (step.event === 'call') {
      depth++;
      calls.push(b);
    }
    depthAt[b] = Math.max(depthAt[b], depth);
    if (depth > maxDepth) maxDepth = depth;
    if (step.heapChanges.length) wrote[b] = true;
    if (step.event === 'return') depth--;
  });

  const skyline = height - 10;
  ctx.fillStyle = color('--pointer-soft');
  depthAt.forEach((d, b) => {
    const h = (d / maxDepth) * (skyline - 8);
    ctx.fillRect(b * binWidth, skyline - h, Math.max(1, binWidth - 0.5), h);
  });
  ctx.fillStyle = color('--pointer');
  new Set(calls).forEach((b) => ctx.fillRect(b * binWidth, skyline - 2, Math.max(1, binWidth - 0.5), 2));
  ctx.fillStyle = color('--write');
  wrote.forEach((w, b) => {
    if (w) ctx.fillRect(b * binWidth, height - 6, Math.max(1, binWidth - 0.5), 4);
  });
  if (trace.status !== 'ok') {
    ctx.fillStyle = color('--error');
    ctx.fillRect(width - 3, 0, 3, height);
  }
}

export function Timeline() {
  const run = useWorkspace(currentRun);
  const step = useWorkspace((s) => s.step);
  const playing = useWorkspace((s) => s.playing);
  const speed = useWorkspace((s) => s.speed);
  const goTo = useWorkspace((s) => s.goTo);
  const setPlaying = useWorkspace((s) => s.setPlaying);
  const setSpeed = useWorkspace((s) => s.setSpeed);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (canvas.current && run) drawStrip(canvas.current, run.trace);
    else canvas.current?.getContext('2d')?.clearRect(0, 0, canvas.current.width, canvas.current.height);
  }, [run, size]);

  const total = run?.trace.steps.length ?? 0;
  const disabled = total === 0;
  const atEnd = step >= total - 1;
  const line = run?.trace.steps[step]?.line;
  const label = useMemo(() => (total ? `Step ${step + 1} of ${total}${line ? `, line ${line}` : ''}` : 'No run yet'), [step, total, line]);

  return (
    <section className="timeline" aria-label="Playback">
      <div className="controls">
        <button className="icon-btn" onClick={() => { setPlaying(false); goTo(0); }} disabled={disabled} aria-label="Back to start" title="Back to start">
          <SkipBack size={16} aria-hidden />
        </button>
        <button className="icon-btn" onClick={() => { setPlaying(false); goTo(step - 1); }} disabled={disabled || step === 0} aria-label="Step back" title="Step back (left arrow)">
          <CaretLeft size={16} aria-hidden />
        </button>
        <button
          className="play-btn"
          onClick={() => {
            if (!playing && atEnd) goTo(0);
            setPlaying(!playing);
          }}
          disabled={disabled}
          aria-label={playing ? 'Pause' : 'Play'}
          title="Play or pause (space)"
        >
          {playing ? <Pause size={18} weight="fill" aria-hidden /> : <Play size={18} weight="fill" aria-hidden />}
        </button>
        <button className="icon-btn" onClick={() => { setPlaying(false); goTo(step + 1); }} disabled={disabled || atEnd} aria-label="Step forward" title="Step forward (right arrow)">
          <CaretRight size={16} aria-hidden />
        </button>
        <label className="speed">
          <span className="sr-only">Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
        <output className="step-readout">{label}</output>
      </div>
      <div className="scrub">
        <canvas ref={canvas} aria-hidden />
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={step}
          disabled={disabled}
          onChange={(e) => { setPlaying(false); goTo(Number(e.target.value)); }}
          aria-label="Timeline"
          aria-valuetext={label}
        />
      </div>
      <ul className="legend" aria-hidden>
        <li><i className="swatch swatch-depth" /> call depth</li>
        <li><i className="swatch swatch-write" /> data changed</li>
      </ul>
    </section>
  );
}
