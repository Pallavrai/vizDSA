import { AnimatePresence, motion } from 'motion/react';
import type { Value } from '@vizdsa/trace';
import { valueText } from '../trace/traceStore.ts';

// Repeated values get an occurrence number, so React follows each element as it moves.
function keyed(items: Value[]): Array<{ key: string; text: string }> {
  const seen = new Map<string, number>();
  return items.map((v) => {
    const text = valueText(v);
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    return { key: `${text}#${n}`, text };
  });
}

export function StackView({ items }: { items: Value[] }) {
  if (items.length === 0) return <p className="empty">empty</p>;
  return (
    <div className="stack">
      <span className="stack-label">top</span>
      <AnimatePresence initial={false}>
        {[...items.map((v, i) => ({ i, text: valueText(v) }))].reverse().map(({ i, text }) => (
          <motion.div
            key={i}
            layout
            className="stack-item"
            initial={{ opacity: 0, y: -22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -22, transition: { duration: 0.1 } }}
          >
            {text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function QueueView({ items }: { items: Value[] }) {
  if (items.length === 0) return <p className="empty">empty</p>;
  return (
    <div className="queue-scroll">
      <div className="queue">
        <span className="stack-label">front</span>
        <AnimatePresence initial={false} mode="popLayout">
          {keyed(items).map(({ key, text }) => (
            <motion.div
              key={key}
              layout
              className="queue-item"
              initial={{ opacity: 0, x: 22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -22, transition: { duration: 0.1 } }}
            >
              {text}
            </motion.div>
          ))}
        </AnimatePresence>
        <span className="stack-label">back</span>
      </div>
    </div>
  );
}
