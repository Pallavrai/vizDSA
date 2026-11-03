import { AnimatePresence, motion } from 'motion/react';
import type { Value } from '@vizdsa/trace';
import { isRef, valueText, type TraceState } from '../trace/traceStore.ts';
import { Tick } from './ValueView.tsx';

function preview(v: Value, state: TraceState): string {
  if (!isRef(v)) return valueText(v);
  const obj = state.heap.get(v.ref);
  if (obj && Array.isArray(obj.contents)) {
    const items = obj.contents as Value[];
    return `[${items.slice(0, 12).map((x) => (Array.isArray(x) ? '…' : valueText(x))).join(', ')}${items.length > 12 ? ', …' : ''}]`;
  }
  return '…';
}

type Props = { entries: [Value, Value][]; changed?: Set<string>; reads: Set<string>; state: TraceState };

export function BucketsView({ entries, changed, reads, state }: Props) {
  if (entries.length === 0) return <p className="empty">empty</p>;
  return (
    <ul className="buckets">
      <AnimatePresence initial={false}>
        {entries.map(([k, v]) => {
          const key = valueText(k);
          return (
            <motion.li
              key={key}
              layout
              className={`bucket ${changed?.has(key) ? 'is-write' : ''} ${reads.has(key) ? 'is-read' : ''}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <span className="bucket-key">{key}</span>
              <span className="bucket-value"><Tick value={preview(v, state)} /></span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
