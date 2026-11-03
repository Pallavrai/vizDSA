import gsap from 'gsap';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plays the cause, then the effect: read cells light up, arrows travel, the new value lands.
export function playReadArrows(arrows: SVGPathElement[], reads: Element[], target: Element | null): gsap.core.Timeline {
  const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
  for (const path of arrows) {
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 });
  }
  if (target) gsap.set(target, { scale: 0.86, opacity: 0.35 });
  if (reads.length) tl.fromTo(reads, { scale: 1 }, { scale: 1.09, duration: 0.09, ease: 'power2.out', yoyo: true, repeat: 1 }, 0);
  if (arrows.length) tl.to(arrows, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.inOut', stagger: 0.04 }, 0.05);
  if (target) tl.to(target, { scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(2.4)' }, arrows.length ? 0.22 : 0);
  return tl;
}

// Used whenever a sequence is cut short, so an interrupted animation never leaves things half drawn.
export function settle(arrows: SVGPathElement[], reads: Element[], target: Element | null) {
  gsap.killTweensOf([...arrows, ...reads, ...(target ? [target] : [])]);
  gsap.set(arrows, { clearProps: 'strokeDasharray,strokeDashoffset,opacity' });
  gsap.set([...reads, ...(target ? [target] : [])], { clearProps: 'transform,opacity' });
}
