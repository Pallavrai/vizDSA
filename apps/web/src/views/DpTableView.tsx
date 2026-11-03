import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Value } from '@vizdsa/trace';
import { playReadArrows, prefersReducedMotion, settle } from '../animation/readArrows.ts';
import { valueText } from '../trace/traceStore.ts';

const W = 46;
const H = 38;
const GUTTER = 30;
const OVERSCAN = 3;

export type Coord = [row: number, col: number];

type Props = { rows: Value[][]; changed: Coord[]; reads: Coord[]; arrowsTo: Coord | null; animated: boolean };

function arrowPath(from: Coord, to: Coord): string {
  const x1 = from[1] * W + W / 2;
  const y1 = from[0] * H + H / 2;
  const x2 = to[1] * W + W / 2;
  const y2 = to[0] * H + H / 2;
  if (from[0] === to[0]) {
    // Same row: arc over the cells in between, so the path never crosses their values.
    const lift = Math.min(70, 16 + Math.abs(x2 - x1) * 0.28);
    return `M${x1} ${y1 - H / 2 + 2} Q${(x1 + x2) / 2} ${y1 - H / 2 - lift} ${x2} ${y2 - H / 2 + 2}`;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const trim = 15;
  return `M${x1 + (dx / len) * trim} ${y1 + (dy / len) * trim} L${x2 - (dx / len) * trim} ${y2 - (dy / len) * trim}`;
}

export function DpTableView({ rows, changed, reads, arrowsTo, animated }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0, width: 900, height: 480 });
  const cols = useMemo(() => rows.reduce((m, r) => Math.max(m, r.length), 0), [rows]);
  const oneRow = rows.length === 1;
  const topSpace = oneRow ? 42 : 0;

  // Only cells near the visible area are drawn, so a very large table stays fast.
  const firstRow = Math.max(0, Math.floor(scroll.top / H) - OVERSCAN);
  const lastRow = Math.min(rows.length - 1, Math.ceil((scroll.top + scroll.height) / H) + OVERSCAN);
  const firstCol = Math.max(0, Math.floor(scroll.left / W) - OVERSCAN);
  const lastCol = Math.min(cols - 1, Math.ceil((scroll.left + scroll.width) / W) + OVERSCAN);
  const key = ([r, c]: Coord) => `${r}-${c}`;
  const changedSet = useMemo(() => new Set(changed.map(key)), [changed]);
  const readSet = useMemo(() => new Set(reads.map(key)), [reads]);
  const showArrows = arrowsTo !== null && reads.length > 0;
  const arrowSig = showArrows ? `${key(arrowsTo)}|${reads.map(key).join(',')}` : '';

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setScroll((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { ...s, width: el.clientWidth, height: el.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the cell being written in view.
  const focus = changed[0];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !focus) return;
    const x = GUTTER + focus[1] * W;
    const y = topSpace + focus[0] * H;
    if (x < el.scrollLeft + GUTTER || x + W > el.scrollLeft + el.clientWidth) el.scrollLeft = x - el.clientWidth / 2;
    if (y < el.scrollTop || y + H > el.scrollTop + el.clientHeight) el.scrollTop = y - el.clientHeight / 2;
  }, [focus?.[0], focus?.[1], topSpace]);

  useLayoutEffect(() => {
    if (!svg.current || !scroller.current) return;
    const arrows = [...svg.current.querySelectorAll('path')] as SVGPathElement[];
    const body = scroller.current;
    const readEls = reads.map((c) => body.querySelector(`[data-cell="${key(c)}"]`)).filter(Boolean) as Element[];
    const targetEl = arrowsTo ? body.querySelector(`[data-cell="${key(arrowsTo)}"] .cell-value`) : null;
    if (!animated || prefersReducedMotion() || !arrowsTo) return;
    const tl = playReadArrows(arrows, readEls, targetEl);
    return () => {
      tl.kill();
      settle(arrows, readEls, targetEl);
    };
  }, [arrowSig, animated]);

  return (
    <div
      className="dp-scroll"
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        setScroll({ top: el.scrollTop, left: el.scrollLeft, width: el.clientWidth, height: el.clientHeight });
      }}
    >
      <div className="dp-canvas" style={{ width: GUTTER + cols * W + 8, height: 20 + topSpace + rows.length * H + 8 }}>
        {Array.from({ length: Math.max(0, lastCol - firstCol + 1) }, (_, i) => firstCol + i).map((c) => (
          <span key={c} className="ruler dp-col-label" style={{ transform: `translate(${GUTTER + c * W}px, ${topSpace}px)`, width: W }}>{c}</span>
        ))}
        <div className="dp-grid" style={{ transform: `translate(${GUTTER}px, ${20 + topSpace}px)` }}>
          {rows.slice(firstRow, lastRow + 1).map((row, ri) => {
            const r = firstRow + ri;
            return (
              <div key={r}>
                {!oneRow && <span className="ruler dp-row-label" style={{ transform: `translate(${-GUTTER}px, ${r * H}px)`, width: GUTTER - 4, height: H }}>{r}</span>}
                {row.slice(firstCol, lastCol + 1).map((v, ci) => {
                  const c = firstCol + ci;
                  const id = `${r}-${c}`;
                  return (
                    <div
                      key={c}
                      data-cell={id}
                      className={`dp-cell ${changedSet.has(id) ? 'is-write' : ''} ${readSet.has(id) ? 'is-read' : ''}`}
                      style={{ left: c * W, top: r * H, width: W - 3, height: H - 3 }}
                    >
                      <span className="cell-value">{valueText(v)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <svg ref={svg} className="dp-arrows" width={cols * W} height={rows.length * H + 2} key={arrowSig}>
            <defs>
              <marker id="dp-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0L8 4L0 8z" className="dp-head" />
              </marker>
            </defs>
            {showArrows && reads.map((from) => <path key={key(from)} d={arrowPath(from, arrowsTo)} markerEnd="url(#dp-head)" className="dp-arrow" />)}
          </svg>
        </div>
      </div>
    </div>
  );
}
