import { motion } from 'motion/react';
import type { Value } from '@vizdsa/trace';
import { valueText } from '../trace/traceStore.ts';

// The value is the React key, so a change replaces the element and plays its arrival.
export function Tick({ value, className = '' }: { value: string; className?: string }) {
  return (
    <motion.span key={value} className={`tick ${className}`} initial={{ y: -7, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      {value}
    </motion.span>
  );
}

export function ValueStrip({ vars }: { vars: Array<[string, Value]> }) {
  if (vars.length === 0) return null;
  return (
    <dl className="value-strip" aria-label="Local variables">
      {vars.map(([name, value]) => (
        <div key={name} className="chip">
          <dt>{name}</dt>
          <dd><Tick value={valueText(value)} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function ObjectFields({ fields }: { fields: Record<string, Value> }) {
  return (
    <dl className="value-strip">
      {Object.entries(fields).map(([k, v]) => (
        <div key={k} className="chip"><dt>{k}</dt><dd><Tick value={valueText(v)} /></dd></div>
      ))}
    </dl>
  );
}
