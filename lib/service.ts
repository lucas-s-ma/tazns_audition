import 'server-only';
import { db } from './supabase';
import { session } from './session';
import {
  canReadDetails,
  canViewCandidate,
  canViewPeerOverall,
  isDeliberation,
  validateField,
  type Candidate,
  type CandidateDetail,
  type Snapshot,
} from './domain';
import { z } from 'zod';
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export async function getActiveCycle(cycleId?: string) {
  const query = db().from('audition_cycles').select('*');
  const { data, error } = await (
    cycleId ? query.eq('id', z.uuid().parse(cycleId)) : query.eq('is_active', true)
  ).maybeSingle();
  check(error);
  return data;
}
export async function getCandidates(cycleId: string, showExcluded: boolean) {
  let q = db()
    .from('candidates')
    .select('*')
    .eq('audition_cycle_id', cycleId)
    .order('audition_order');
  if (!showExcluded) q = q.eq('excluded', false);
  const { data, error } = await q;
  check(error);
  return data ?? [];
}
export async function getSnapshot(cycleId?: string): Promise<Snapshot> {
  const s = await session(),
    client = db();
  const [cycle, cycles, users] = await Promise.all([
    getActiveCycle(cycleId),
    client.from('audition_cycles').select('*').order('created_at', { ascending: false }),
    client.from('users').select('*').order('display_name'),
  ]);
  check(cycles.error);
  check(users.error);
  const candidates = cycle ? await getCandidates(cycle.id, s.user.is_admin || s.unlocked) : [];
  let team: Snapshot['team'] = [];
  if (cycle && (isDeliberation(cycle) || s.unlocked) && candidates.length) {
    const r = await client
      .from('team_deliberations')
      .select('*')
      .in(
        'candidate_id',
        candidates.map((c) => c.id),
      );
    check(r.error);
    team = r.data ?? [];
  }
  return {
    user: s.user,
    unlocked: s.unlocked,
    cycles: cycles.data ?? [],
    cycle,
    candidates,
    users: (users.data ?? []).filter((user) => s.user.is_admin || !user.excluded),
    team,
  };
}
export async function getCandidate(id: string): Promise<CandidateDetail> {
  z.uuid().parse(id);
  const s = await session(),
    client = db();
  const { data: c, error } = await client.from('candidates').select('*').eq('id', id).single();
  check(error);
  if (!c || !canViewCandidate(s.user, c, s.unlocked)) throw new Error('Candidate unavailable');
  const cycle = await getActiveCycle(c.audition_cycle_id);
  if (!cycle) throw new Error('Cycle unavailable');
  let own: CandidateDetail['own'] = null;
  if (!s.user.excluded) {
    const ownEvaluation = await client
      .from('evaluations')
      .select('*')
      .eq('candidate_id', id)
      .eq('judge_user_id', s.user.id)
      .maybeSingle();
    check(ownEvaluation.error);
    own = ownEvaluation.data;
  }
  let peers: CandidateDetail['peers'] = [],
    overalls: CandidateDetail['overalls'] = [],
    team: CandidateDetail['team'] = null;
  if (canReadDetails(s.user.id, 'peer', cycle, s.unlocked)) {
    const results = await Promise.all([
      client.from('evaluations').select('*').eq('candidate_id', id),
      client.from('team_deliberations').select('*').eq('candidate_id', id).maybeSingle(),
    ]);
    check(results[0].error);
    check(results[1].error);
    peers = results[0].data ?? [];
    if (!s.user.is_admin) {
      const activeJudges = await client.from('users').select('id').eq('excluded', false);
      check(activeJudges.error);
      const activeJudgeIds = new Set((activeJudges.data ?? []).map((judge) => judge.id));
      peers = peers.filter((evaluation) => activeJudgeIds.has(evaluation.judge_user_id!));
    }
    team = results[1].data;
  } else if (canViewPeerOverall(c)) {
    // Never fetch peer notes or component ratings for an unauthorized viewer.
    const r = await client
      .from('evaluations')
      .select('judge_user_id,overall_rating')
      .eq('candidate_id', id);
    check(r.error);
    overalls = (r.data ?? []).map((r) => ({
      judge_user_id: r.judge_user_id!,
      overall_rating: r.overall_rating,
    }));
    if (!s.user.is_admin) {
      const activeJudges = await client.from('users').select('id').eq('excluded', false);
      check(activeJudges.error);
      const activeJudgeIds = new Set((activeJudges.data ?? []).map((judge) => judge.id));
      overalls = overalls.filter((evaluation) => activeJudgeIds.has(evaluation.judge_user_id));
    }
  }
  return { candidate: c, cycle, own, peers, overalls, team };
}
export async function mutate(operation: string, payload: Record<string, unknown>) {
  const s = await session();
  if (s.user.excluded && !s.user.is_admin) throw new Error('Judge account is excluded');
  const id = () => z.uuid().parse(payload.id);
  switch (operation) {
    case 'createCycle':
      payload = { name: z.string().trim().min(1).max(100).parse(payload.name) };
      break;
    case 'activateCycle':
      payload = { id: id() };
      break;
    case 'setJudgeExclusion':
      payload = { id: id(), excluded: z.boolean().parse(payload.excluded) };
      break;
    case 'createCandidate':
      payload = {
        cycleId: z.uuid().parse(payload.cycleId),
        first_name: z.string().trim().min(1).max(100).parse(payload.first_name),
        last_name: z.string().trim().min(1).max(100).parse(payload.last_name),
      };
      break;
    case 'reorder':
      payload = {
        cycleId: z.uuid().parse(payload.cycleId),
        ids: z.array(z.uuid()).parse(payload.ids),
      };
      break;
    case 'deliberate':
      payload = {
        cycleId: z.uuid().parse(payload.cycleId),
        active: z.boolean().parse(payload.active),
      };
      break;
    case 'start':
      payload = { id: id(), noteTakerId: z.uuid().parse(payload.noteTakerId) };
      break;
    case 'advance':
      payload = { id: id(), force: z.boolean().default(false).parse(payload.force) };
      break;
    case 'close':
    case 'exclude':
    case 'restore':
      payload = { id: id() };
      break;
    case 'move':
      payload = {
        id: id(),
        status: z.enum(['UNDECIDED', 'ACCEPTED', 'REJECTED']).parse(payload.status),
        section: z.enum(['Soprano', 'Alto', 'Tenor', 'Bass']).nullable().parse(payload.section),
      };
      break;
    case 'patch': {
      const target = z.enum(['profile', 'evaluation', 'team']).parse(payload.target);
      payload = {
        id: id(),
        target,
        ...validateField(target, z.string().parse(payload.field), payload.value),
      };
      break;
    }
    default:
      throw new Error('Unknown operation');
  }
  if (operation === 'deliberate') {
    const { data, error } = await db().rpc('toggle_deliberation', {
      actor_id: s.user.id,
      cycle_id: z.uuid().parse(payload.cycleId),
      active: z.boolean().parse(payload.active),
    });
    check(error);
    return data;
  }
  if (operation === 'setJudgeExclusion') {
    const { data, error } = await db().rpc('set_judge_excluded', {
      actor_id: s.user.id,
      judge_id: z.uuid().parse(payload.id),
      excluded: z.boolean().parse(payload.excluded),
    });
    check(error);
    return data;
  }
  const { data, error } = await db().rpc('mutate', { actor_id: s.user.id, operation, payload });
  check(error);
  return data;
}
export async function exportDataset(cycleId: string, includeAll = false) {
  const s = await session();
  if (!s.user.is_admin) throw new Error('Admin required for export');
  const cycle = await getActiveCycle(cycleId);
  if (!cycle) throw new Error('Cycle unavailable');
  const candidates = await getCandidates(cycle.id, includeAll),
    client = db();
  // Batch to avoid PostgREST URL length and row-limit issues for large historical cycles.
  const evaluations: CandidateDetail['peers'] = [],
    team: Snapshot['team'] = [];
  for (let i = 0; i < candidates.length; i += 40) {
    const ids = candidates.slice(i, i + 40).map((c) => c.id);
    const [e, t] = await Promise.all([
      client.from('evaluations').select('*').in('candidate_id', ids),
      client.from('team_deliberations').select('*').in('candidate_id', ids),
    ]);
    check(e.error);
    check(t.error);
    evaluations.push(...(e.data ?? []));
    team.push(...(t.data ?? []));
  }
  let usersQuery = client.from('users').select('*').order('display_name');
  if (!includeAll) usersQuery = usersQuery.eq('excluded', false);
  const users = await usersQuery;
  check(users.error);
  return { cycle, candidates, evaluations, team, users: users.data ?? [] };
}
export const createCandidate = (
  p: Pick<Candidate, 'first_name' | 'last_name'> & { cycleId: string },
) => mutate('createCandidate', p);
export const updateCandidateProfile = (id: string, field: string, value: unknown) =>
  mutate('patch', { id, target: 'profile', field, value });
export const updateEvaluationField = (id: string, field: string, value: unknown) =>
  mutate('patch', { id, target: 'evaluation', field, value });
