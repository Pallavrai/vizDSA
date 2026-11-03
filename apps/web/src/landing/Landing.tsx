import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from '@phosphor-icons/react';
import { startHeroScene } from './HeroScene.ts';

const POINTS = [
  { color: 'var(--write)', title: 'Your code, not a demo', text: 'Paste a LeetCode solution and test case in Python, Java or C++. It runs exactly as you wrote it.' },
  { color: 'var(--read)', title: 'See where each value came from', text: 'DP tables fill in cell by cell, with arrows from the cells each new value was computed from.' },
  { color: 'var(--pointer)', title: 'Move through time', text: 'Play, pause, step back or drag to any moment, with the running line highlighted in your code.' },
];

export default function Landing() {
  const host = useRef<HTMLDivElement>(null);
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    try {
      return startHeroScene(host.current!, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      setWebgl(false);
    }
  }, []);

  return (
    <div className="landing">
      {webgl ? <div className="hero-canvas" ref={host} aria-hidden /> : <div className="hero-fallback" aria-hidden />}
      <header className="landing-nav">
        <a className="brand" href="/">viz<b>DSA</b></a>
        <span className="nav-langs">Python / Java / C++</span>
      </header>
      <main className="hero">
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          Find the exact cell where your <em>DP</em> went wrong.
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }}>
          vizDSA records your own solution as it runs, then draws every array, hash map, tree, recursive call and DP table, so you can watch where the answer changes.
        </motion.p>
        <motion.a className="cta" href="/app" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16 }}>
          Open the debugger <ArrowRight size={18} weight="bold" aria-hidden />
        </motion.a>
      </main>
      <ul className="landing-points">
        {POINTS.map((p) => (
          <li key={p.title}>
            <i style={{ background: p.color }} aria-hidden />
            <h2>{p.title}</h2>
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
