import type { ReactNode } from 'react';
import { VIEW_LABELS, type ViewName } from '../trace/chooseView.ts';

type Props = { title: string; view: ViewName; views: ViewName[]; onChange(view: ViewName): void; summary: string; truncated?: boolean; children: ReactNode };

export function ViewFrame({ title, view, views, onChange, summary, truncated, children }: Props) {
  return (
    <figure className="frame">
      <figcaption className="frame-head">
        <span className="frame-title">{title}</span>
        {truncated && <span className="frame-note">first 2,000 items</span>}
        {views.length > 1 ? (
          <label className="view-menu">
            <span className="sr-only">View {title} as</span>
            <select value={view} onChange={(e) => onChange(e.target.value as ViewName)}>
              {views.map((v) => <option key={v} value={v}>{VIEW_LABELS[v]}</option>)}
            </select>
          </label>
        ) : (
          <span className="frame-kind">{VIEW_LABELS[view]}</span>
        )}
      </figcaption>
      <p className="sr-only">{summary}</p>
      <div className="frame-body" aria-hidden>{children}</div>
    </figure>
  );
}
