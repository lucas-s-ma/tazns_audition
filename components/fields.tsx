'use client';
import { useEffect, useReducer, useRef } from 'react';
import { FieldQueue } from '@/lib/autosave';
import { write } from '@/lib/client';
import { ratingLabels, type Rating } from '@/lib/domain';
const pending = new Set<FieldQueue<unknown>>();
// Retain unsaved queues across realtime-driven unmounts (e.g. exclusion/restoration).
const retained = new Map<string, FieldQueue<unknown>>();
export async function flushAll() {
  await Promise.all([...pending].map((q) => q.flush()));
  return ![...pending].some((q) => q.dirty);
}
export function hasUnsaved() {
  return [...pending].some((q) => q.dirty);
}
export function useField<T>(
  id: string,
  target: 'profile' | 'evaluation' | 'team',
  field: string,
  initial: T,
) {
  const [, render] = useReducer((n) => n + 1, 0);
  const mounted = useRef(true);
  const ref = useRef<FieldQueue<T> | null>(null);
  const key = `${id}:${target}:${field}`;
  if (!ref.current) {
    ref.current =
      (retained.get(key) as FieldQueue<T> | undefined) ??
      new FieldQueue(
        initial,
        (value) => write('patch', { id, target, field, value }),
        () => {},
      );
  }
  const queue = ref.current;
  useEffect(() => {
    mounted.current = true;
    queue.setNotify(() => {
      if (mounted.current) render();
    });
    pending.add(queue as FieldQueue<unknown>);
    retained.set(key, queue as FieldQueue<unknown>);
    return () => {
      mounted.current = false;
      queue.setNotify(() => {});
      void queue.flush().then(() => {
        if (!queue.dirty && !mounted.current) {
          pending.delete(queue as FieldQueue<unknown>);
          retained.delete(key);
        }
      });
    };
  }, [queue, key]);
  useEffect(() => {
    queue.receive(initial);
  }, [initial, queue]);
  return {
    value: queue.value,
    set: (value: T, immediate = false) => queue.edit(value, immediate),
    flush: () => queue.flush(),
    status: queue.status,
    error: queue.error,
  };
}
export function SaveState({
  state,
}: {
  state: { status: string; error: string; flush: () => Promise<void> };
}) {
  return (
    <span className={`save-state ${state.status === 'Error' ? 'error' : ''}`} role="status">
      {state.status === 'Error' ? (
        <button title={state.error} onClick={() => void state.flush()}>
          Save failed · Retry
        </button>
      ) : state.status === 'Saving' ? (
        'Saving…'
      ) : (
        '✓ Saved'
      )}
      {state.error && <span className="save-error">{state.error}</span>}
    </span>
  );
}
export function RatingSelector({
  value,
  onChange,
  strong = false,
}: {
  value: Rating;
  onChange: (r: Rating) => void;
  strong?: boolean;
}) {
  return (
    <div className={`ratings ${strong ? 'strong' : ''}`} role="group" aria-label="Rating">
      {(['GREEN', 'YELLOW', 'RED', null] as const).map((r) => (
        <button
          key={r ?? 'unset'}
          type="button"
          className={`rating ${r?.toLowerCase() ?? 'grey'} ${r === value ? 'selected' : ''}`}
          aria-pressed={r === value}
          aria-label={r ?? 'Clear rating'}
          onClick={() => onChange(r)}
        >
          <span className="dot" />
          {r === null ? 'Unset' : ratingLabels[r]}
        </button>
      ))}
    </div>
  );
}
export function RatingField({
  id,
  target,
  field,
  value,
  strong = false,
}: {
  id: string;
  target: 'evaluation' | 'team';
  field: string;
  value: Rating;
  strong?: boolean;
}) {
  const s = useField(id, target, field, value);
  return (
    <>
      <RatingSelector value={s.value} onChange={(r) => s.set(r, true)} strong={strong} />
      <SaveState state={s} />
    </>
  );
}
export function TextField({
  id,
  target,
  field,
  value,
  label,
  area = false,
  required = false,
  placeholder,
}: {
  id: string;
  target: 'profile' | 'evaluation' | 'team';
  field: string;
  value: string;
  label: string;
  area?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const s = useField(id, target, field, value);
  return (
    <label className="field">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {area ? (
        <textarea
          aria-label={label}
          value={s.value}
          onChange={(e) => s.set(e.target.value)}
          onBlur={() => void s.flush()}
          placeholder={placeholder ?? 'What are you hearing? Capture specifics…'}
        />
      ) : (
        <input
          required={required}
          value={s.value}
          onChange={(e) => s.set(e.target.value)}
          onBlur={() => void s.flush()}
        />
      )}
      <SaveState state={s} />
    </label>
  );
}
export function SelectField({
  id,
  field,
  value,
  label,
  options,
}: {
  id: string;
  field: string;
  value: string | null;
  label: string;
  options: readonly string[];
}) {
  const s = useField(id, 'profile', field, value);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={s.value ?? ''} onChange={(e) => s.set(e.target.value || null, true)}>
        <option value="">Unset</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <SaveState state={s} />
    </label>
  );
}
export function MbtiField({ id, value }: { id: string; value: string }) {
  const s = useField(id, 'profile', 'mbti', value);
  return (
    <div className="field">
      <span>
        MBTI * <b>{s.value.replaceAll('_', '·')}</b>
      </span>
      <div className="mbti">
        {[
          ['E', 'I'],
          ['S', 'N'],
          ['T', 'F'],
          ['J', 'P'],
        ].map((opts, i) => (
          <select
            key={i}
            aria-label={`MBTI letter ${i + 1}`}
            value={s.value[i]}
            onChange={(e) =>
              s.set(s.value.slice(0, i) + e.target.value + s.value.slice(i + 1), true)
            }
          >
            <option value="_">—</option>
            {opts.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ))}
      </div>
      <SaveState state={s} />
    </div>
  );
}
