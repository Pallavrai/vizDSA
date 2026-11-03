import { useEffect } from 'react';
import { currentRun, SPEEDS, useWorkspace } from '../store/workspace.ts';

export function usePlayback() {
  const playing = useWorkspace((s) => s.playing);
  const speed = useWorkspace((s) => s.speed);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const s = useWorkspace.getState();
      const run = currentRun(s);
      if (!run || s.step >= run.trace.steps.length - 1) {
        s.setPlaying(false);
        return;
      }
      s.goTo(s.step + 1);
    }, SPEEDS[speed].ms);
    return () => clearInterval(timer);
  }, [playing, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWorkspace.getState();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!s.running) void s.run();
        return;
      }
      const target = e.target;
      if (target instanceof Element && target.closest('.cm-editor, textarea, input, select, button, [role="tab"]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        const run = currentRun(s);
        if (run && !s.playing && s.step >= run.trace.steps.length - 1) s.goTo(0);
        s.setPlaying(!s.playing);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        s.setPlaying(false);
        s.goTo(s.step + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        s.setPlaying(false);
        s.goTo(s.step - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
