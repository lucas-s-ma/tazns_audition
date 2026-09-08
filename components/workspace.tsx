'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ArrowUp,
  ArrowDown,
  Plus,
  ArrowRight,
  LockKeyhole,
  LayoutDashboard,
  Columns3,
  Database,
  LogOut,
  CalendarDays,
} from 'lucide-react';
import { api, write } from '@/lib/client';
import {
  ratingLabel,
  sections,
  type Snapshot,
  type CandidateDetail,
  type Candidate,
} from '@/lib/domain';
import { Realtime } from './realtime';
import { Profile } from './profile';
import { EvaluationEditor, Matrix } from './review';
import { Board } from './board';
import { flushAll, hasUnsaved } from './fields';
export function Workspace({ path }: { path: string[] }) {
  const page = path[0] ?? 'dashboard',
    id = path[1];
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [detail, setDetail] = useState<CandidateDetail | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [cycleId, setCycleId] = useState('');
  const [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [unlock, setUnlock] = useState(false),
    [showNew, setShowNew] = useState(false),
    [first, setFirst] = useState(''),
    [last, setLast] = useState(''),
    [cycleName, setCycleName] = useState(''),
    [noteTaker, setNoteTaker] = useState(''),
    [showExcluded, setShowExcluded] = useState(false),
    [judgeFilter, setJudgeFilter] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (page === 'login') return;
    const g = ++generation.current;
    try {
      const d =
        id && (page === 'candidate' || page === 'deliberation' || page === 'data')
          ? await api<CandidateDetail>(`candidate/${id}`)
          : null;
      const selectedCycle = d?.cycle.id ?? cycleId;
      const s = await api<Snapshot>(`snapshot${selectedCycle ? `?cycle=${selectedCycle}` : ''}`);
      if (g !== generation.current) return;
      setSnapshot(s);
      setDetail(d);
    } catch (e) {
      if (g === generation.current) {
        const message = e instanceof Error ? e.message : 'Could not refresh';
        if (message === 'Candidate unavailable') {
          setDetail(null);
          setError(
            'Candidate unavailable. If edits were still saving, keep this page open and ask an admin to restore the candidate.',
          );
        } else setError(message);
      }
    }
  }, [page, id, cycleId]);
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('cycle');
    if (selected) setCycleId(selected);
  }, []);
  useEffect(() => {
    void refresh();
    const saved = () => void refresh();
    window.addEventListener('tazns:saved', saved);
    return () => window.removeEventListener('tazns:saved', saved);
  }, [refresh]);
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden') void flushAll();
    };
    document.addEventListener('visibilitychange', visibility);
    const before = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (a && hasUnsaved() && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void flushAll().then((ok) => {
          if (ok) window.location.assign(a.href);
          else setError('Your edits have not saved. Retry the failed fields before leaving.');
        });
      }
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('click', click);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('click', click);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  const act = (op: string, payload: Record<string, unknown>) =>
    run(async () => {
      if (!(await flushAll())) throw new Error('Save your pending edits before continuing.');
      await write(op, payload);
    });
  if (page === 'login')
    return (
      <main className="login">
        <div className="login-story">
          <div className="brand">
            <img className="brand-logo" src="/logo.jpeg" alt="" />
            <span>
              Temptasians<span className="brand-sub">DUKE UNIVERSITY</span>
            </span>
          </div>
          <div>
            <span className="eyebrow">AUDITION COUNCIL</span>
            <h1>
              A new voice.
              <br />A new beginning.
            </h1>
            <p>
              Listen closely. Capture the moment.
              <br />
              Find our next harmony.
            </p>
          </div>
          <span className="small">Asian cultural a cappella · Duke University</span>
        </div>
        <section className="login-form">
          <span className="eyebrow">WELCOME TO AUDITION COUNCIL</span>
          <h2>Let’s get you settled.</h2>
          <p>
            Enter your first name e.g. Kevin.
            <br />
            <br />
            If you know duplicate first names will occur among council members, use your full name
            instead.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api('login', { name });
                window.location.assign('/');
              });
            }}
          >
            <label className="field">
              Your name
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kevin"
                autoComplete="given-name"
              />
            </label>
            <button className="primary" disabled={busy}>
              Enter council <ArrowRight size={17} />
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="muted small">
            Your name restores your existing council identity. Please use your own name.
          </p>
        </section>
      </main>
    );
  if (!snapshot)
    return (
      <main className="loading">
        <AudioLines size={36} />
        <h2>{error ? 'Connection needs attention' : 'Opening the council workspace…'}</h2>
        <p className="error">{error}</p>
        <button onClick={() => void refresh()}>Retry</button>
        <a href="/login">Enter your identity</a>
      </main>
    );
  const s = snapshot,
    cycle = detail?.cycle ?? s.cycle,
    candidates = s.candidates.filter((c) => (showExcluded ? c.excluded : !c.excluded)),
    active = s.candidates.find(
      (c) => !c.excluded && ['PERSONAL_INFO', 'VOCAL_AUDITION'].includes(c.state),
    );
  const username = (uid: string | null) =>
    s.users.find((u) => u.id === uid)?.display_name ?? 'Unknown';
  const admin = s.user.is_admin;
  const visibleCandidates = s.candidates.filter((candidate) => !candidate.excluded);
  const assignedSections = (candidate: Candidate) =>
    Array.from(
      new Set(
        [candidate.primary_section, candidate.secondary_section].filter(
          (section): section is (typeof sections)[number] => Boolean(section) && section !== 'None',
        ),
      ),
    );
  const sectionCount = (section: (typeof sections)[number]) =>
    visibleCandidates.reduce((total, candidate) => {
      const assigned = assignedSections(candidate);
      return total + (assigned.includes(section) ? 1 / assigned.length : 0);
    }, 0);
  const newCandidate = (
    <form
      className="inline-form panel"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await write('createCandidate', {
            cycleId: cycle?.id,
            first_name: first,
            last_name: last,
          });
          setFirst('');
          setLast('');
          setShowNew(false);
        });
      }}
    >
      <label className="field">
        First name
        <input required value={first} onChange={(e) => setFirst(e.target.value)} />
      </label>
      <label className="field">
        Last name
        <input required value={last} onChange={(e) => setLast(e.target.value)} />
      </label>
      <button className="primary" disabled={busy}>
        Add candidate
      </button>
      <button type="button" onClick={() => setShowNew(false)}>
        Cancel
      </button>
    </form>
  );
  const candidateList = (items: Candidate[]) =>
    items.length ? (
      <div className="candidate-list">
        {items.map((c) => (
          <div className="candidate-row" key={c.id}>
            <span className="order">{String(c.audition_order).padStart(2, '0')}</span>
            <a className="candidate-name" href={`/candidate/${c.id}`}>
              <b>
                {c.first_name} {c.last_name}
              </b>
              <span>
                {c.class_year ?? 'Class unset'}
                {c.primary_section ? ` · ${c.primary_section}` : ''}
              </span>
            </a>
            <span className={`state ${c.state.toLowerCase()}`}>
              {c.excluded ? 'EXCLUDED' : c.state.replaceAll('_', ' ')}
            </span>
            {admin && (
              <div className="row-actions">
                {!c.excluded && (
                  <>
                    <button
                      title="Move earlier"
                      aria-label={`Move ${c.first_name} earlier`}
                      disabled={busy || s.candidates.indexOf(c) === 0}
                      onClick={() => {
                        const ids = s.candidates.map((c) => c.id),
                          i = ids.indexOf(c.id);
                        [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                        void act('reorder', { cycleId: cycle?.id, ids });
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      title="Move later"
                      aria-label={`Move ${c.first_name} later`}
                      disabled={busy || s.candidates.indexOf(c) === s.candidates.length - 1}
                      onClick={() => {
                        const ids = s.candidates.map((c) => c.id),
                          i = ids.indexOf(c.id);
                        [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                        void act('reorder', { cycleId: cycle?.id, ids });
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </>
                )}
                <button
                  disabled={busy}
                  onClick={() => void act(c.excluded ? 'restore' : 'exclude', { id: c.id })}
                >
                  {c.excluded ? 'Restore' : 'Exclude'}
                </button>
              </div>
            )}
            <a href={`/candidate/${c.id}`} aria-label={`Open ${c.first_name}`}>
              <ArrowRight size={18} />
            </a>
          </div>
        ))}
      </div>
    ) : (
      <div className="empty">
        <AudioLines />
        <h3>No candidates here yet</h3>
        <p>
          {admin
            ? 'Add candidate names to prepare the audition queue.'
            : 'Your admin will add candidates before auditions begin.'}
        </p>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <img className="brand-logo" src="/logo.jpeg" alt="" />
          <span>
            Temptasians<span className="brand-sub">AUDITION COUNCIL</span>
          </span>
        </a>
        <div className="cycle-label">AUDITION CYCLE</div>
        <select
          aria-label="Select audition cycle"
          value={cycleId || s.cycle?.id || ''}
          onChange={async (e) => {
            if (await flushAll()) {
              setCycleId(e.target.value);
              if (id) window.location.assign(`/?cycle=${e.target.value}`);
            }
          }}
        >
          <option value="" disabled>
            Select a cycle
          </option>
          {s.cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_active ? ' · Active' : ''}
            </option>
          ))}
        </select>
        <nav>
          <a className={page === 'dashboard' ? 'active' : ''} href="/">
            <LayoutDashboard size={18} />
            Audition dashboard
          </a>
          {cycle?.deliberation_active && (
            <a
              className={page === 'deliberation' ? 'active' : ''}
              href={`/deliberation?cycle=${cycle.id}`}
            >
              <Columns3 size={18} />
              Deliberation
            </a>
          )}
          <button onClick={() => (s.unlocked ? window.location.assign('/data') : setUnlock(true))}>
            <Database size={18} />
            Access All Data
          </button>
          {admin && (
            <a className={page === 'cycles' ? 'active' : ''} href="/cycles">
              <CalendarDays size={18} />
              Manage cycles
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <LockKeyhole size={16} />
            <p>Your detailed reviews stay private until deliberation.</p>
          </div>
          <div className="identity">
            <span className="avatar">{s.user.display_name[0]}</span>
            <div>
              <b>{s.user.display_name}</b>
              <span>{admin ? 'Council admin' : 'Council member'}</span>
            </div>
            <button
              title="Switch User"
              aria-label="Switch User"
              onClick={() =>
                void run(async () => {
                  if (!(await flushAll()))
                    throw new Error('Save pending edits before switching users');
                  await api('logout', {});
                  window.location.assign('/login');
                })
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {cycle?.name ?? 'Council workspace'} <span className="slash">/</span>{' '}
            {page === 'dashboard'
              ? 'Auditions'
              : page === 'candidate'
                ? 'Candidate workspace'
                : page === 'data'
                  ? 'All Data'
                  : page === 'cycles'
                    ? 'Cycles'
                    : 'Deliberation'}
          </span>
          <Realtime refresh={refresh} />
        </header>
        <main className="content">
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setError('')}>Dismiss</button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              Saving changes…
            </div>
          )}
          {page === 'dashboard' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LISTEN. CONNECT. DISCOVER.</span>
                  <h1>Audition dashboard</h1>
                </div>
                {admin && cycle && (
                  <button className="primary" onClick={() => setShowNew(true)}>
                    <Plus size={17} />
                    New candidate
                  </button>
                )}
              </div>
              {!cycle ? (
                <section className="panel empty">
                  <h2>No active audition cycle</h2>
                  <p>
                    {admin
                      ? 'Create and activate a cycle to get started.'
                      : 'Ask Lucas or Admin to activate an audition cycle.'}
                  </p>
                  {admin && (
                    <a className="button primary" href="/cycles">
                      Manage cycles
                    </a>
                  )}
                </section>
              ) : (
                <>
                  {showNew && newCandidate}
                  <div className="stats compact-summary" aria-label="Audition summary">
                    {[
                      ['Total', visibleCandidates.length],
                      ['S', sectionCount('Soprano')],
                      ['A', sectionCount('Alto')],
                      ['T', sectionCount('Tenor')],
                      ['B', sectionCount('Bass')],
                      [
                        'Unknown',
                        visibleCandidates.filter(
                          (candidate) => assignedSections(candidate).length === 0,
                        ).length,
                      ],
                    ].map(([label, count]) => (
                      <div key={String(label)}>
                        <span>{label}</span>
                        <b>{count}</b>
                      </div>
                    ))}
                  </div>
                  <div className="section-heading">
                    <h2>{showExcluded ? 'Excluded candidates' : 'Audition queue'}</h2>
                    <div className="actions">
                      {(admin || s.unlocked) && (
                        <button onClick={() => setShowExcluded(!showExcluded)}>
                          {showExcluded ? 'Show audition queue' : 'View excluded'}
                        </button>
                      )}
                      {admin && (
                        <button
                          onClick={() =>
                            void act('deliberate', {
                              cycleId: cycle.id,
                              active: !cycle.deliberation_active,
                            })
                          }
                          disabled={busy}
                        >
                          {cycle.deliberation_active
                            ? 'Deactivate Deliberation'
                            : 'Activate Deliberation'}
                        </button>
                      )}
                      {(admin || s.unlocked) && (
                        <a className="button" href={`/api/export/${cycle.id}`}>
                          Export XLSX
                        </a>
                      )}
                    </div>
                  </div>
                  {candidateList(candidates)}
                </>
              )}
            </>
          )}
          {page === 'cycles' &&
            (admin ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">A NEW SEASON</span>
                    <h1>Audition cycles</h1>
                    <p>Each cycle keeps its own candidates, reviews, and decisions.</p>
                  </div>
                </div>
                <form
                  className="panel inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await write('createCycle', { name: cycleName });
                      setCycleName('');
                    });
                  }}
                >
                  <label className="field">
                    Cycle name
                    <input
                      required
                      placeholder="Fall 2026"
                      value={cycleName}
                      onChange={(e) => setCycleName(e.target.value)}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Create cycle
                  </button>
                </form>
                {s.cycles.map((c) => (
                  <section className="panel cycle-row" key={c.id}>
                    <h3>{c.name}</h3>
                    <span>
                      {c.deliberation_active ? 'Deliberation active' : 'Audition available'}
                    </span>
                    {c.is_active ? (
                      <span className="badge green">Active</span>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => void act('activateCycle', { id: c.id })}
                      >
                        Activate
                      </button>
                    )}
                    <a href={`/?cycle=${c.id}`}>View</a>
                  </section>
                ))}
              </>
            ) : (
              <p>Cycle management requires an admin.</p>
            ))}
          {page === 'candidate' && detail && (
            <>
              <div className="page-heading">
                <div>
                  <a className="back-link" href="/">
                    ← Audition dashboard
                  </a>
                  <h1>
                    {detail.candidate.first_name} {detail.candidate.last_name}
                  </h1>
                  <p>
                    #{detail.candidate.audition_order} ·{' '}
                    {detail.candidate.state.replaceAll('_', ' ')}
                    {detail.candidate.excluded ? ' · Excluded' : ''}
                  </p>
                </div>
                {admin && detail.candidate.state === 'VOCAL_AUDITION' && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void act('close', { id })}
                  >
                    Close audition
                  </button>
                )}
              </div>
              {detail.candidate.state === 'UPCOMING' ? (
                <section className="panel empty">
                  <h2>Ready for a new voice</h2>
                  {admin ? (
                    <>
                      <label className="field">
                        Personal Info Note Taker
                        <select
                          aria-label="Personal Info Note Taker"
                          value={noteTaker}
                          onChange={(e) => setNoteTaker(e.target.value)}
                        >
                          <option value="">Choose a connected council member</option>
                          {s.users
                            .filter((u) => Date.parse(u.last_seen_at) > Date.now() - 300000)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.display_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        className="primary"
                        disabled={busy || !noteTaker || !!active}
                        onClick={() => void act('start', { id, noteTakerId: noteTaker })}
                      >
                        Start candidate
                      </button>
                      {active && <p>Close the current audition before starting another.</p>}
                    </>
                  ) : (
                    <p>Waiting for an admin to start this audition.</p>
                  )}
                </section>
              ) : detail.candidate.state === 'PERSONAL_INFO' ? (
                <section className="panel personal-info-panel">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">GETTING TO KNOW YOU</span>
                      <h2>Personal Info</h2>
                      <p>
                        {username(detail.candidate.note_taker_id)} is the designated note taker.
                      </p>
                    </div>
                  </div>
                  {detail.candidate.note_taker_id === s.user.id || admin ? (
                    <>
                      <Profile candidate={detail.candidate} personal />
                      <p className="personal-info-handoff">
                        Click Begin Vocal Audition when you are ready; other judges can then begin
                        taking notes.
                      </p>
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void act('advance', { id })}
                        >
                          Begin Vocal Audition <ArrowRight size={17} />
                        </button>
                        {admin && (
                          <button
                            disabled={busy}
                            onClick={() => void act('advance', { id, force: true })}
                          >
                            Force advance
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <AudioLines />
                      <h3>Personal Info is underway</h3>
                      <p>
                        Your review will open automatically when{' '}
                        {username(detail.candidate.note_taker_id)} begins the vocal audition.
                      </p>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <details className="panel profile-details">
                    <summary>
                      Candidate profile{' '}
                      <span>
                        {detail.candidate.class_year} · {detail.candidate.major} ·{' '}
                        {detail.candidate.mbti}
                      </span>
                    </summary>
                    <Profile candidate={detail.candidate} />
                  </details>
                  {detail.candidate.state === 'COMPLETED' && (
                    <section className="panel">
                      <h3>Council Overall Ratings</h3>
                      <div className="overall-list">
                        {s.users.map((u) => (
                          <span key={u.id}>
                            {u.display_name}
                            <b
                              className={`badge ${(detail.overalls.find((e) => e.judge_user_id === u.id)?.overall_rating ?? detail.peers.find((e) => e.judge_user_id === u.id)?.overall_rating)?.toLowerCase() ?? 'grey'}`}
                            >
                              {ratingLabel(
                                detail.overalls.find((e) => e.judge_user_id === u.id)
                                  ?.overall_rating ??
                                  detail.peers.find((e) => e.judge_user_id === u.id)
                                    ?.overall_rating ??
                                  null,
                              )}
                            </b>
                          </span>
                        ))}
                      </div>
                      <p className="muted small">
                        You can still edit your own review. Peer notes remain private until
                        deliberation.
                      </p>
                    </section>
                  )}
                  <EvaluationEditor key={id} id={id} evaluation={detail.own} />
                </>
              )}
              {cycle?.deliberation_active && (
                <a className="button" href={`/deliberation/${id}`}>
                  Open deliberation workspace
                </a>
              )}
            </>
          )}
          {page === 'deliberation' &&
            (!cycle?.deliberation_active ? (
              <section className="panel empty">
                <h2>Deliberation hasn’t started</h2>
                <p>An admin can start it from the dashboard.</p>
              </section>
            ) : id && detail ? (
              <>
                <div className="page-heading">
                  <div>
                    <a className="back-link" href={`/deliberation?cycle=${cycle.id}`}>
                      ← Deliberation board
                    </a>
                    <h1>
                      {detail.candidate.first_name} {detail.candidate.last_name}
                    </h1>
                    <p>Every perspective, together.</p>
                  </div>
                </div>
                <div className="deliberation-grid">
                  <div>
                    <details className="panel profile-details">
                      <summary>Candidate profile</summary>
                      <Profile candidate={detail.candidate} />
                    </details>
                    <h2>Individual evaluations</h2>
                    <Matrix evaluations={detail.peers} users={s.users} />
                  </div>
                  <aside className="sticky">
                    <div className="team-heading">
                      <span className="eyebrow">A SHARED PERSPECTIVE</span>
                      <h2>Team deliberation</h2>
                      <p>Collaborative notes, separate from individual reviews.</p>
                    </div>
                    <EvaluationEditor
                      key={`team-${id}`}
                      id={id}
                      evaluation={detail.team}
                      target="team"
                      compact
                    />
                  </aside>
                </div>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">FIND OUR NEXT HARMONY</span>
                    <h1>Deliberation board</h1>
                    <p>Drag candidates into place. Every move is saved and reversible.</p>
                  </div>
                  {(admin || s.unlocked) && (
                    <a className="button" href={`/api/export/${cycle.id}`}>
                      Export XLSX
                    </a>
                  )}
                </div>
                <div className="board-legend">
                  <span>Undecided</span>
                  <span>Accepted · by vocal section</span>
                  <span>Rejected</span>
                </div>
                <Board
                  candidates={s.candidates}
                  team={s.team}
                  onMove={(candidateId, lane) =>
                    void act('move', {
                      id: candidateId,
                      status: lane === 'UNDECIDED' || lane === 'REJECTED' ? lane : 'ACCEPTED',
                      section: lane === 'UNDECIDED' || lane === 'REJECTED' ? null : lane,
                    })
                  }
                />
              </>
            ))}
          {page === 'data' &&
            (!s.unlocked ? (
              <section className="panel empty">
                <LockKeyhole />
                <h2>Access All Data</h2>
                <p>
                  Unlock detailed read access for eight hours. This does not grant admin privileges.
                </p>
                <button onClick={() => setUnlock(true)}>Enter password</button>
              </section>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">PROTECTED READ ACCESS</span>
                    <h1>All audition data</h1>
                    <p>Includes excluded candidates. Unlock expires after eight hours.</p>
                  </div>
                  {cycle && (
                    <a className="button" href={`/api/export/${cycle.id}`}>
                      Export XLSX
                    </a>
                  )}
                </div>
                <div className="actions">
                  <select
                    aria-label="Navigate candidate"
                    value={id ?? ''}
                    onChange={(e) =>
                      window.location.assign(`/data/${e.target.value}?cycle=${cycle?.id}`)
                    }
                  >
                    <option value="">Choose candidate</option>
                    {s.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.audition_order} {c.first_name} {c.last_name}
                        {c.excluded ? ' (Excluded)' : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter judge"
                    value={judgeFilter}
                    onChange={(e) => setJudgeFilter(e.target.value)}
                  >
                    <option value="">All judges</option>
                    {s.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                {detail ? (
                  <>
                    <section className="panel">
                      <h2>
                        {detail.candidate.first_name} {detail.candidate.last_name}
                      </h2>
                      <dl className="raw-profile">
                        {Object.entries(detail.candidate).map(([k, v]) => (
                          <div key={k}>
                            <dt>{k.replaceAll('_', ' ')}</dt>
                            <dd>{v === null ? 'Unset' : String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                    <h2>Individual evaluations</h2>
                    <Matrix
                      evaluations={detail.peers}
                      users={s.users.filter((u) => !judgeFilter || u.id === judgeFilter)}
                    />
                    <h2>Shared team deliberation</h2>
                    <Matrix
                      evaluations={detail.team ? [{ ...detail.team, judge_user_id: 'team' }] : []}
                      users={[
                        { id: 'team', display_name: 'Team', is_admin: false, last_seen_at: '' },
                      ]}
                    />
                  </>
                ) : (
                  <section className="panel empty">
                    <h2>Select a candidate to inspect their records</h2>
                  </section>
                )}
              </>
            ))}
          {!['dashboard', 'candidate', 'deliberation', 'data', 'cycles'].includes(page) && (
            <section className="panel">
              <h1>Page not found</h1>
              <a href="/">Return to dashboard</a>
            </section>
          )}
        </main>
        <footer>
          Temptasians · Duke University <span>Made by Lucas M. with 💙 and Codex</span>
        </footer>
      </div>
      {unlock && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlock-title"
            className="panel modal"
          >
            <LockKeyhole />
            <h2 id="unlock-title">Access All Data</h2>
            <p>
              Enter the shared password to temporarily read all evaluations. Your procedural
              permissions stay the same.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('unlock', { password });
                  setPassword('');
                  setUnlock(false);
                  window.location.assign('/data');
                });
              }}
            >
              <label className="field">
                Shared password
                <input
                  autoFocus
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Unlock read access
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUnlock(false);
                    setPassword('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
