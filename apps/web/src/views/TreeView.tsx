import { useMemo } from 'react';
import { motion } from 'motion/react';
import { hierarchy, tree as d3tree } from 'd3-hierarchy';
import type { Value } from '@vizdsa/trace';
import { isRef, valueText, type TraceState } from '../trace/traceStore.ts';

type Node = { ref: string | null; children?: Node[] };
const MAX_DEPTH = 40;

function build(ref: string, state: TraceState, seen: Set<string>, depth = 0): Node {
  seen.add(ref);
  const fields = state.heap.get(ref)?.contents as Record<string, Value> | undefined;
  const childOf = (v: Value | undefined): Node => {
    if (isRef(v) && !seen.has(v.ref) && depth < MAX_DEPTH) return build(v.ref, state, seen, depth + 1);
    return { ref: null };
  };
  const left = childOf(fields?.left);
  const right = childOf(fields?.right);
  // An empty side keeps a blank slot, so a right child still leans right.
  return left.ref || right.ref ? { ref, children: [left, right] } : { ref };
}

const DX = 56;
const DY = 62;

export function TreeView({ rootRef, pointers, state, changed }: { rootRef: string; pointers: Array<{ name: string; ref: string }>; state: TraceState; changed: Set<string> }) {
  const layout = useMemo(() => {
    const root = d3tree<Node>().nodeSize([DX, DY])(hierarchy(build(rootRef, state, new Set())));
    const nodes = root.descendants();
    const minX = Math.min(...nodes.map((n) => n.x)) - 36;
    const maxX = Math.max(...nodes.map((n) => n.x)) + 36;
    const maxY = Math.max(...nodes.map((n) => n.y)) + 56;
    return { nodes, links: root.links(), minX, width: maxX - minX, height: maxY + 28 };
  }, [rootRef, state]);

  const labels = new Map<string, string[]>();
  for (const p of pointers) labels.set(p.ref, [...(labels.get(p.ref) ?? []), p.name]);

  return (
    <div className="tree-scroll">
      <svg width={layout.width} height={layout.height} viewBox={`${layout.minX} -28 ${layout.width} ${layout.height}`}>
        {layout.links.filter((l) => l.target.data.ref).map((l) => (
          <line key={l.target.data.ref!} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} className="tree-edge" />
        ))}
        {layout.nodes.filter((n) => n.data.ref).map((n) => {
          const ref = n.data.ref!;
          const fields = state.heap.get(ref)?.contents as Record<string, Value> | undefined;
          const names = labels.get(ref);
          return (
            <motion.g key={ref} initial={false} animate={{ x: n.x, y: n.y }}>
              <circle r={17} className={`tree-node ${changed.has(ref) ? 'is-write' : ''} ${names ? 'is-pointed' : ''}`} />
              <text textAnchor="middle" dy="0.35em" className="tree-text">{valueText(fields?.val)}</text>
              {names && <text textAnchor="middle" y={-23} className="tree-pointer">{names.join(', ')}</text>}
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
