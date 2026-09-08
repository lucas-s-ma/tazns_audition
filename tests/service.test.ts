import { beforeEach, it, expect, vi } from 'vitest';
import type { Candidate, Cycle, User } from '@/lib/domain';
const f = vi.hoisted(() => ({
  viewer: {
    user: { id: '00000000-0000-4000-8000-000000000001', is_admin: false } as User,
    hash: 'session',
    unlocked: false,
  },
  cycle: { id: '00000000-0000-4000-8000-000000000010', mode: 'AUDITION' } as Cycle,
  candidate: {
    id: '00000000-0000-4000-8000-000000000020',
    audition_cycle_id: '00000000-0000-4000-8000-000000000010',
    state: 'VOCAL_AUDITION',
    excluded: false,
  } as Candidate,
  queries: [] as { table: string; columns: string; filters: Record<string, unknown> }[],
}));
vi.mock('@/lib/session', () => ({ session: async () => f.viewer }));
vi.mock('@/lib/supabase', () => ({
  db: () => ({
    from: (table: string) => {
      const query = { table, columns: '', filters: {} as Record<string, unknown> };
      f.queries.push(query);
      const result = () => {
        let data: unknown = null;
        if (table === 'candidates') data = f.candidate;
        else if (table === 'audition_cycles') data = f.cycle;
        else if (table === 'evaluations')
          data = query.filters.judge_user_id
            ? { judge_user_id: f.viewer.user.id, solo_notes: 'Own private text' }
            : query.columns === 'judge_user_id,overall_rating'
              ? [{ judge_user_id: 'peer', overall_rating: 'GREEN' }]
              : [{ judge_user_id: 'peer', solo_notes: 'Peer secret', overall_rating: 'GREEN' }];
        return { data, error: null };
      };
      const builder = {
        select: (columns: string) => {
          query.columns = columns;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          query.filters[key] = value;
          return builder;
        },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (r: unknown) => void) => Promise.resolve(result()).then(resolve),
      };
      return builder;
    },
  }),
}));
import { getCandidate } from '@/lib/service';
beforeEach(() => {
  f.queries.length = 0;
  f.viewer.unlocked = false;
  f.viewer.user.is_admin = false;
  f.cycle.mode = 'AUDITION';
  f.candidate.state = 'VOCAL_AUDITION';
  f.candidate.excluded = false;
});
it('API service never even queries peer evaluations during live auditions', async () => {
  const data = await getCandidate(f.candidate.id);
  expect(data.own?.solo_notes).toBe('Own private text');
  expect(data.peers).toEqual([]);
  expect(data.overalls).toEqual([]);
  expect(f.queries.filter((q) => q.table === 'evaluations')).toEqual([
    {
      table: 'evaluations',
      columns: '*',
      filters: { candidate_id: f.candidate.id, judge_user_id: f.viewer.user.id },
    },
  ]);
  expect(JSON.stringify(data)).not.toContain('Peer secret');
});
it('completed API payload contains peer overall only; query selects no notes', async () => {
  f.candidate.state = 'COMPLETED';
  const data = await getCandidate(f.candidate.id);
  expect(data.overalls).toEqual([{ judge_user_id: 'peer', overall_rating: 'GREEN' }]);
  expect(data.peers).toEqual([]);
  expect(JSON.stringify(data)).not.toContain('Peer secret');
  expect(f.queries.filter((q) => q.table === 'evaluations')[1].columns).toBe(
    'judge_user_id,overall_rating',
  );
});
it('procedural admin is still not allowed peer details before deliberation', async () => {
  f.viewer.user.is_admin = true;
  expect((await getCandidate(f.candidate.id)).peers).toEqual([]);
});
it('deliberation returns details', async () => {
  f.cycle.mode = 'DELIBERATION';
  expect((await getCandidate(f.candidate.id)).peers[0].solo_notes).toBe('Peer secret');
});
it('unlock returns details without changing admin flag', async () => {
  f.viewer.unlocked = true;
  expect((await getCandidate(f.candidate.id)).peers[0].solo_notes).toBe('Peer secret');
  expect(f.viewer.user.is_admin).toBe(false);
});
it('excluded candidate is rejected before evaluation queries', async () => {
  f.candidate.excluded = true;
  await expect(getCandidate(f.candidate.id)).rejects.toThrow('unavailable');
  expect(f.queries.some((q) => q.table === 'evaluations')).toBe(false);
});
it('admin and unlocked viewers may inspect excluded candidates', async () => {
  f.candidate.excluded = true;
  f.viewer.user.is_admin = true;
  expect((await getCandidate(f.candidate.id)).candidate.excluded).toBe(true);
  f.viewer.user.is_admin = false;
  f.viewer.unlocked = true;
  expect((await getCandidate(f.candidate.id)).candidate.excluded).toBe(true);
});
