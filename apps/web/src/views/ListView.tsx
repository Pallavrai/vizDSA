import { motion } from 'motion/react';
import type { Value } from '@vizdsa/trace';
import { isRef, valueText, type TraceState } from '../trace/traceStore.ts';

const NODE_W = 76;
const TOP = 34;
const NODE_H = 40;

type Props = { nodes: string[]; pointers: Array<{ name: string; ref: string }>; nulls: string[]; state: TraceState; changed: Set<string> };

// Nodes keep their first-seen position, so a reversal shows arrows flipping rather than nodes shuffling.
export function ListView({ nodes, pointers, nulls, state, changed }: Props) {
  if (nodes.length === 0) return <p className="empty">{nulls.length ? `${nulls.join(', ')} = null` : 'empty'}</p>;
  const pos = new Map(nodes.map((id, i) => [id, i]));
  const width = nodes.length * NODE_W + 60;
  const height = TOP + NODE_H + 64;
  const stacked = new Map<string, number>();

  return (
    <div className="array-scroll">
      <div className="list-canvas" style={{ width, height }}>
        <svg width={width} height={height} className="list-edges">
          <defs>
            <marker id="list-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L8 4L0 8z" className="list-head" />
            </marker>
          </defs>
          {nodes.map((id, i) => {
            const fields = state.heap.get(id)?.contents as Record<string, Value>;
            const next = fields?.next;
            const x = i * NODE_W;
            const y = TOP + NODE_H / 2;
            if (!isRef(next)) {
              return <text key={id} className="list-null" x={x + 64} y={y + 4} textAnchor="middle">∅</text>;
            }
            const j = pos.get(next.ref);
            if (j === undefined) return null;
            const flipped = j <= i;
            const d = flipped
              ? `M${x + 26} ${TOP + NODE_H} C${x + 26} ${TOP + NODE_H + 44} ${j * NODE_W + 26} ${TOP + NODE_H + 44} ${j * NODE_W + 26} ${TOP + NODE_H + 2}`
              : j === i + 1
                ? `M${x + 52} ${y} L${j * NODE_W - 1} ${y}`
                : `M${x + 26} ${TOP} C${x + 26} ${TOP - 26} ${j * NODE_W + 26} ${TOP - 26} ${j * NODE_W + 26} ${TOP - 2}`;
            return <path key={id} d={d} className={`list-edge ${changed.has(id) ? 'is-new' : ''}`} markerEnd="url(#list-head)" />;
          })}
        </svg>
        {nodes.map((id, i) => {
          const fields = state.heap.get(id)?.contents as Record<string, Value>;
          return (
            <div key={id} className={`list-node ${changed.has(id) ? 'is-write' : ''}`} style={{ left: i * NODE_W, top: TOP, width: 52, height: NODE_H }}>
              {valueText(fields?.val)}
            </div>
          );
        })}
        {pointers.map((p) => {
          const i = pos.get(p.ref);
          if (i === undefined) return null;
          const row = stacked.get(p.ref) ?? 0;
          stacked.set(p.ref, row + 1);
          return (
            <motion.span key={p.name} className="pointer list-pointer" initial={false} animate={{ x: i * NODE_W, y: -row * 14 }} style={{ top: 14, width: 52 }}>
              {p.name}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}
