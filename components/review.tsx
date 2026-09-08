'use client';
import { useState } from 'react';
import {
  categories,
  labels,
  ratingLabel,
  emptyEvaluation,
  type Category,
  type Evaluation,
  type User,
} from '@/lib/domain';
import { RatingField, TextField } from './fields';
export function EvaluationEditor({
  id,
  evaluation,
  target = 'evaluation',
  compact = false,
}: {
  id: string;
  evaluation: Evaluation | null;
  target?: 'evaluation' | 'team';
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Category>('range'),
    e = evaluation ?? emptyEvaluation(id);
  const main = compact ? categories : categories.filter((c) => c !== 'vibe');
  const pane = (cat: Category) => (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {target === 'team' ? 'Council consensus' : 'Your independent review'}
          </span>
          <h2>{labels[cat]}</h2>
        </div>
        {cat === 'vibe' && <span className="tag">Pinned</span>}
      </div>
      <RatingField
        id={id}
        target={target}
        field={`${cat}_rating`}
        value={e[`${cat}_rating`]}
        strong={target === 'team' && cat === 'overall'}
      />
      <TextField
        id={id}
        target={target}
        field={`${cat}_notes`}
        value={e[`${cat}_notes`]}
        label={`${labels[cat]} notes`}
        area
        placeholder={
          cat === 'vibe' ? 'First impression, cultural fit, or other behavioral notes…' : undefined
        }
      />
    </>
  );
  return (
    <div className={compact ? '' : 'review-editor'}>
      <nav className="tabs" aria-label="Evaluation categories">
        {main.map((c) => (
          <button key={c} className={tab === c ? 'active' : ''} onClick={() => setTab(c)}>
            {labels[c]}
            <i className={`mini-dot ${e[`${c}_rating`]?.toLowerCase() ?? 'grey'}`} />
          </button>
        ))}
      </nav>
      <div className={compact ? '' : 'review-grid'}>
        <div>
          {main.map((cat) => (
            <section key={cat} className="panel editor" hidden={tab !== cat}>
              {pane(cat)}
            </section>
          ))}
        </div>
        {!compact && <aside className="panel sticky vibe">{pane('vibe')}</aside>}
      </div>
      <div className="rating-summary">
        {categories.map((cat) => (
          <span key={cat}>
            {labels[cat]}{' '}
            <b className={`badge ${e[`${cat}_rating`]?.toLowerCase() ?? 'grey'}`}>
              {ratingLabel(e[`${cat}_rating`])}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
export function Matrix({ evaluations, users }: { evaluations: Evaluation[]; users: User[] }) {
  return (
    <div className="matrix-scroll">
      <table className="matrix">
        <thead>
          <tr>
            <th>Judge</th>
            {categories.map((c) => (
              <th key={c}>{labels[c]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const e = evaluations.find((e) => e.judge_user_id === u.id);
            return (
              <tr key={u.id}>
                <th>{u.display_name}</th>
                {categories.map((c) => (
                  <td
                    key={c}
                    className={`${e?.[`${c}_rating`]?.toLowerCase() ?? 'grey'} ${c === 'overall' ? 'saturated' : ''}`}
                  >
                    <b>{ratingLabel(e?.[`${c}_rating`] ?? null)}</b>
                    <p>{e?.[`${c}_notes`] || '—'}</p>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
