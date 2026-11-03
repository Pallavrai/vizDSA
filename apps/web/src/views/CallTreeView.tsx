import { useLayoutEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { hierarchy, tree as d3tree } from 'd3-hierarchy';
import type { Analysis, CallNode } from '../trace/analyzeTrace.ts';
import { valueText } from '../trace/traceStore.ts';

// shortcut: only the latest calls are drawn above this count; add collapsing if students need bigger trees.
const MAX_CALLS = 400;
const NODE_W = 96;
const NODE_H = 66;

type Tree = { node: CallNode; children: Tree[] };

function callLabel(c: CallNode): string {
  const label = `${c.functionName}(${c.args})`;
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

export function callTreeSummary(analysis: Analysis, step: number): { total: number; hits: number } {
  const seen = [...analysis.calls.values()].filter((n) => n.startStep <= step);
  return { total: seen.length, hits: seen.filter((n) => n.memoHit && n.endStep !== null && n.endStep <= step).length };
}

export function CallTreeView({ analysis, step, currentFrame }: { analysis: Analysis; step: number; currentFrame: number | undefined }) {
  const host = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    const visible = [...analysis.calls.values()].filter((n) => n.startStep <= step);
    const kept = new Set(visible.slice(-MAX_CALLS).map((n) => n.frameId));
    const build = (node: CallNode): Tree => ({
      node,
      children: node.children.filter((id) => kept.has(id)).map((id) => build(analysis.calls.get(id)!)),
    });
    const tops = visible.filter((n) => kept.has(n.frameId) && (n.parent === null || !kept.has(n.parent)));
    if (tops.length === 0) return null;
    const synthetic = tops.length === 1 ? build(tops[0]) : ({ node: null as unknown as CallNode, children: tops.map(build) } as Tree);
    const root = d3tree<Tree>().nodeSize([NODE_W, NODE_H])(hierarchy(synthetic));
    const nodes = root.descendants().filter((n) => n.data.node);
    const minX = Math.min(...nodes.map((n) => n.x)) - NODE_W / 2;
    const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_W / 2;
    const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_H;
    return { nodes, links: root.links().filter((l) => l.source.data.node), minX, width: maxX - minX, height: maxY };
  }, [analysis, step]);

  // Follow the running call.
  useLayoutEffect(() => {
    const el = host.current;
    const active = el?.querySelector('.call-active');
    if (!el || !active) return;
    const a = active.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (a.left < b.left || a.right > b.right) el.scrollLeft += a.left - b.left - b.width / 2;
    if (a.top < b.top || a.bottom > b.bottom) el.scrollTop += a.top - b.top - b.height / 2;
  });

  if (!layout) return <p className="empty">No calls yet</p>;
  return (
    <div className="tree-scroll calltree" ref={host}>
      <svg width={layout.width} height={layout.height} viewBox={`${layout.minX} -14 ${layout.width} ${layout.height}`}>
        {layout.links.map((l) => (
          <line
            key={l.target.data.node.frameId}
            x1={l.source.x} y1={l.source.y + 14} x2={l.target.x} y2={l.target.y - 14}
            className={`call-edge ${l.target.data.node.endStep !== null && l.target.data.node.endStep < step ? 'is-done' : ''}`}
          />
        ))}
        {layout.nodes.map((n) => {
          const c = n.data.node;
          const finished = c.endStep !== null && c.endStep <= step;
          const active = c.frameId === currentFrame && !finished;
          const hit = c.memoHit && finished;
          return (
            <motion.g
              key={c.frameId}
              className={`call ${active ? 'call-active' : ''} ${finished ? 'call-done' : ''} ${hit ? 'call-hit' : ''}`}
              initial={{ x: n.x, y: n.y - 18, opacity: 0 }}
              animate={{ x: n.x, y: n.y, opacity: 1 }}
            >
              <rect x={-43} y={-14} width={86} height={28} rx={3} strokeDasharray={hit ? '4 3' : undefined} />
              <title>{`${c.functionName}(${c.args})`}</title>
              <text textAnchor="middle" dy="0.35em" className="call-text">{callLabel(c)}</text>
              {finished && c.returnValue !== undefined && <text textAnchor="middle" y={25} className="call-return">{hit ? 'cached ' : ''}→ {valueText(c.returnValue).slice(0, 10)}</text>}
              {finished && c.returnValue === undefined && hit && <text textAnchor="middle" y={25} className="call-return">cached</text>}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
