import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
let pg: PGlite;
let lucas: string, alice: string, ben: string, cycle: string, candidate: string;
async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await pg.query<T>(sql, params)).rows;
}
async function mutation(actor: string, op: string, payload: Record<string, unknown>) {
  return query('select mutate($1,$2,$3::jsonb)', [actor, op, JSON.stringify(payload)]);
}
const patch = (actor: string, target: string, field: string, value: unknown) =>
  mutation(actor, 'patch', { id: candidate, target, field, value });
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql = await readFile('supabase/migrations/202609070001_initial.sql', 'utf8');
  await pg.exec(
    sql.replace('alter publication supabase_realtime add table public.change_signal;', ''),
  );
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec('truncate users,audition_cycles cascade;');
  for (const name of ['Lucas', 'Alice', 'Ben']) await query('select login_identity($1)', [name]);
  const users = await query<{ id: string; display_name: string }>('select * from users');
  lucas = users.find((u) => u.display_name === 'Lucas')!.id;
  alice = users.find((u) => u.display_name === 'Alice')!.id;
  ben = users.find((u) => u.display_name === 'Ben')!.id;
  cycle = (
    await query<{ id: string }>(
      "insert into audition_cycles(name,is_active) values('Fall 2026',true) returning id",
    )
  )[0].id;
  candidate = (
    await query<{ id: string }>(
      "insert into candidates(audition_cycle_id,audition_order,first_name,last_name) values($1,1,'Jane','Doe') returning id",
      [cycle],
    )
  )[0].id;
});
describe('real PostgreSQL migration and procedure boundary', () => {
  it('grants Lucas and Admin automatic admin, ordinary names do not', async () => {
    await query("select login_identity('Admin')");
    const users = await query<{ display_name: string; is_admin: boolean }>('select * from users');
    expect(
      users
        .filter((u) => u.is_admin)
        .map((u) => u.display_name)
        .sort(),
    ).toEqual(['Admin', 'Lucas']);
  });
  it('restores a stable identity', async () => {
    await query("select login_identity('Alice')");
    expect((await query('select * from users where id=$1', [alice])).length).toBe(1);
    expect((await query('select * from users')).length).toBe(3);
  });
  it('allows only one active cycle', async () => {
    await expect(
      query("insert into audition_cycles(name,is_active) values('Other',true)"),
    ).rejects.toThrow();
  });
  it('switches cycles atomically', async () => {
    const other = (
      await query<{ id: string }>(
        "insert into audition_cycles(name) values('Fall 2027') returning id",
      )
    )[0].id;
    await mutation(lucas, 'activateCycle', { id: other });
    expect(await query('select id from audition_cycles where is_active')).toEqual([{ id: other }]);
  });
  it('allows exactly one live candidate and preserves upcoming candidate on conflict', async () => {
    await mutation(lucas, 'start', { id: candidate, noteTakerId: alice });
    const second = (
      await query<{ id: string }>(
        "insert into candidates(audition_cycle_id,audition_order,first_name,last_name) values($1,2,'Sam','Kim') returning id",
        [cycle],
      )
    )[0].id;
    await expect(mutation(lucas, 'start', { id: second, noteTakerId: ben })).rejects.toThrow();
    expect(
      (await query<{ state: string }>('select state from candidates where id=$1', [second]))[0]
        .state,
    ).toBe('UPCOMING');
  });
  it('rejects note takers who are no longer connected', async () => {
    await query("update users set last_seen_at=now()-interval '1 hour' where id=$1", [alice]);
    await expect(mutation(lucas, 'start', { id: candidate, noteTakerId: alice })).rejects.toThrow(
      'connected',
    );
  });
  it('requires factual information, permits note taker to advance, forbids other judges', async () => {
    await mutation(lucas, 'start', { id: candidate, noteTakerId: alice });
    await expect(mutation(ben, 'advance', { id: candidate })).rejects.toThrow('note taker');
    await expect(mutation(alice, 'advance', { id: candidate })).rejects.toThrow('Complete');
    for (const [f, v] of Object.entries({
      class_year: '2029',
      major: 'CS',
      hometown: 'Durham',
      celebrity_crush: 'Someone',
      mbti: 'ENFP',
    }))
      await patch(alice, 'profile', f, v);
    await mutation(alice, 'advance', { id: candidate });
    expect(
      (await query<{ state: string }>('select state from candidates where id=$1', [candidate]))[0]
        .state,
    ).toBe('VOCAL_AUDITION');
  });
  it('admin may force advance but a note taker cannot bypass required fields', async () => {
    await mutation(lucas, 'start', { id: candidate, noteTakerId: alice });
    await expect(mutation(alice, 'advance', { id: candidate, force: true })).rejects.toThrow();
    await mutation(lucas, 'advance', { id: candidate, force: true });
  });
  it('only admin can close; unset ratings are allowed', async () => {
    await mutation(lucas, 'start', { id: candidate, noteTakerId: alice });
    await mutation(lucas, 'advance', { id: candidate, force: true });
    await expect(mutation(alice, 'close', { id: candidate })).rejects.toThrow('Admin');
    await mutation(lucas, 'close', { id: candidate });
    expect(
      (await query<{ state: string }>('select state from candidates where id=$1', [candidate]))[0]
        .state,
    ).toBe('COMPLETED');
  });
  it('only note taker can edit initial factual information, and extra profile fields wait', async () => {
    await mutation(lucas, 'start', { id: candidate, noteTakerId: alice });
    await expect(patch(ben, 'profile', 'major', 'Math')).rejects.toThrow('note taker');
    await expect(patch(alice, 'profile', 'primary_section', 'Alto')).rejects.toThrow(
      'after Personal',
    );
  });
  it('collaborative profile edits are narrow and validate duplicate origins', async () => {
    await query("update candidates set state='VOCAL_AUDITION' where id=$1", [candidate]);
    await patch(alice, 'profile', 'major', 'CS');
    await patch(ben, 'profile', 'hometown', 'Boston');
    const row = (await query('select major,hometown from candidates where id=$1', [candidate]))[0];
    expect(row).toEqual({ major: 'CS', hometown: 'Boston' });
    await patch(alice, 'profile', 'origin_1', 'Taiwan');
    await expect(patch(alice, 'profile', 'origin_2', 'Taiwan')).rejects.toThrow();
  });
  it('enforces one evaluation per candidate/judge and does not overwrite unrelated fields', async () => {
    await query("update candidates set state='VOCAL_AUDITION' where id=$1", [candidate]);
    await patch(alice, 'evaluation', 'range_rating', 'GREEN');
    await patch(alice, 'evaluation', 'solo_notes', 'Clear phrasing');
    await patch(alice, 'evaluation', 'overall_rating', null);
    const rows = await query('select range_rating,solo_notes,overall_rating from evaluations');
    expect(rows).toEqual([
      { range_rating: 'GREEN', solo_notes: 'Clear phrasing', overall_rating: null },
    ]);
    await expect(
      query('insert into evaluations(candidate_id,judge_user_id) values($1,$2)', [
        candidate,
        alice,
      ]),
    ).rejects.toThrow();
  });
  it('can edit own completed evaluations with null ratings', async () => {
    await query("update candidates set state='COMPLETED' where id=$1", [candidate]);
    await patch(alice, 'evaluation', 'overall_rating', 'RED');
    await patch(alice, 'evaluation', 'overall_rating', null);
    expect((await query('select overall_rating from evaluations'))[0].overall_rating).toBe(null);
  });
  it('cannot patch procedural fields or invalid ratings', async () => {
    await query("update candidates set state='VOCAL_AUDITION' where id=$1", [candidate]);
    await expect(patch(alice, 'profile', 'excluded', true)).rejects.toThrow();
    await expect(patch(alice, 'evaluation', 'is_admin', true)).rejects.toThrow();
    await expect(patch(alice, 'evaluation', 'overall_rating', 'GREY')).rejects.toThrow();
  });
  it('exclusion retains data and restore cannot violate active-candidate uniqueness', async () => {
    await query("update candidates set state='VOCAL_AUDITION' where id=$1", [candidate]);
    await patch(alice, 'evaluation', 'solo_notes', 'Keep this');
    await mutation(lucas, 'exclude', { id: candidate });
    expect((await query('select * from evaluations')).length).toBe(1);
    await expect(patch(alice, 'evaluation', 'solo_notes', 'hidden')).rejects.toThrow('unavailable');
    await mutation(lucas, 'restore', { id: candidate });
  });
  it('deliberation includes every non-excluded state, defaults undecided, excludes hidden candidates', async () => {
    for (const [i, state] of ['PERSONAL_INFO', 'COMPLETED'].entries())
      await query(
        'insert into candidates(audition_cycle_id,audition_order,first_name,last_name,state) values($1,$2,$3,$4,$5)',
        [cycle, i + 2, 'Test', 'Person', state],
      );
    await mutation(lucas, 'deliberate', { cycleId: cycle });
    const rows = await query('select state,deliberation_status from candidates where not excluded');
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.deliberation_status === 'UNDECIDED')).toBe(true);
  });
  it('team evaluation is separate; all judges can move and reverse board placement', async () => {
    await mutation(lucas, 'deliberate', { cycleId: cycle });
    await patch(alice, 'evaluation', 'overall_rating', 'RED');
    await patch(ben, 'team', 'overall_rating', 'GREEN');
    expect((await query('select overall_rating from evaluations'))[0].overall_rating).toBe('RED');
    expect((await query('select overall_rating from team_deliberations'))[0].overall_rating).toBe(
      'GREEN',
    );
    for (const [status, section] of [
      ['ACCEPTED', 'Alto'],
      ['REJECTED', null],
      ['ACCEPTED', 'Tenor'],
      ['UNDECIDED', null],
    ]) {
      await mutation(alice, 'move', { id: candidate, status, section });
      expect(
        (await query('select deliberation_status,accepted_section from candidates'))[0],
      ).toEqual({ deliberation_status: status, accepted_section: section });
    }
  });
  it('board and team writes require deliberation and valid placement', async () => {
    await expect(
      mutation(alice, 'move', { id: candidate, status: 'ACCEPTED', section: 'Alto' }),
    ).rejects.toThrow('Deliberation');
    await expect(patch(alice, 'team', 'range_notes', 'Test')).rejects.toThrow('Deliberation');
    await mutation(lucas, 'deliberate', { cycleId: cycle });
    await expect(
      mutation(alice, 'move', { id: candidate, status: 'ACCEPTED', section: null }),
    ).rejects.toThrow();
  });
  it('reordering preserves uniqueness and rejects omitted or duplicate candidates', async () => {
    await mutation(lucas, 'createCandidate', {
      cycleId: cycle,
      first_name: 'Second',
      last_name: 'Candidate',
    });
    const ids = (
      await query<{ id: string }>('select id from candidates order by audition_order')
    ).map((r) => r.id);
    await mutation(lucas, 'reorder', { cycleId: cycle, ids: [...ids].reverse() });
    expect(
      (await query<{ id: string }>('select id from candidates order by audition_order')).map(
        (r) => r.id,
      ),
    ).toEqual([...ids].reverse());
    await expect(
      mutation(lucas, 'reorder', { cycleId: cycle, ids: [ids[0], ids[0]] }),
    ).rejects.toThrow();
  });
  it('public roles cannot read private tables or invoke privileged RPCs', async () => {
    await pg.exec('set role anon');
    try {
      await expect(query('select * from evaluations')).rejects.toThrow('permission');
      await expect(query('select * from candidates')).rejects.toThrow('permission');
      await expect(mutation(lucas, 'deliberate', { cycleId: cycle })).rejects.toThrow('permission');
      expect(Object.keys((await query('select * from change_signal'))[0])).toEqual([
        'id',
        'revision',
      ]);
    } finally {
      await pg.exec('reset role');
    }
  });
  it('realtime signal changes without any evaluation content', async () => {
    const before = Number((await query('select revision from change_signal'))[0].revision);
    await query("update candidates set state='COMPLETED' where id=$1", [candidate]);
    await patch(alice, 'evaluation', 'overall_notes', 'Private note');
    expect(Number((await query('select revision from change_signal'))[0].revision)).toBeGreaterThan(
      before,
    );
    expect(JSON.stringify(await query('select * from change_signal'))).not.toContain('Private');
  });
  it('rate limits unlock attempts durably', async () => {
    await query(
      "insert into sessions(token_hash,user_id,expires_at) values('hash',$1,now()+interval '1 hour')",
      [alice],
    );
    for (let i = 0; i < 10; i++)
      expect((await query("select consume_unlock_attempt('hash') as allowed"))[0].allowed).toBe(
        true,
      );
    expect((await query("select consume_unlock_attempt('hash') as allowed"))[0].allowed).toBe(
      false,
    );
  });
});
