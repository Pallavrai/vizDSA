import { motion } from 'motion/react';
import type { Value } from '@vizdsa/trace';
import { valueText } from '../trace/traceStore.ts';
import { Tick } from './ValueView.tsx';

export const CELL = 46;

type Props = { items: Value[]; changed?: Set<string>; reads?: Set<string>; pointers?: Array<{ name: string; index: number }>; unordered?: boolean };

export function ArrayView({ items, changed, reads, pointers = [], unordered }: Props) {
  if (items.length === 0) return <p className="empty">empty</p>;
  const stacks = new Map<number, number>();
  return (
    <div className="array-scroll">
      <div className={`array ${unordered ? 'array-unordered' : ''}`} style={{ width: items.length * CELL, paddingBottom: pointers.length ? 30 : 0 }}>
        {items.map((v, i) => (
          <div key={i} className="cell-wrap" style={{ width: CELL }}>
            {!unordered && <span className="ruler">{i}</span>}
            <div className={`cell ${changed?.has(String(i)) ? 'is-write' : ''} ${reads?.has(String(i)) ? 'is-read' : ''}`}>
              <Tick value={valueText(v)} />
            </div>
          </div>
        ))}
        {pointers.map((p) => {
          const row = stacks.get(p.index) ?? 0;
          stacks.set(p.index, row + 1);
          return (
            <motion.span key={p.name} className="pointer" initial={false} animate={{ x: p.index * CELL, y: row * 16 }} style={{ width: CELL }}>
              {p.name}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}
