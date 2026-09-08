import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
it('stored reviews, workflow and board placement survive a database process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tazns-durability-'));
  let pg: PGlite | undefined;
  try {
    pg = new PGlite(directory);
    await pg.exec(
      'create role anon; create role authenticated; create role service_role bypassrls;',
    );
    const migration = await readFile('supabase/migrations/202609070001_initial.sql', 'utf8');
    await pg.exec(
      migration.replace('alter publication supabase_realtime add table public.change_signal;', ''),
    );
    await pg.exec("select login_identity('Lucas');");
    const user = (await pg.query<{ id: string }>('select id from users')).rows[0];
    const cycle = (
      await pg.query<{ id: string }>(
        "insert into audition_cycles(name,is_active) values('Durability test',true) returning id",
      )
    ).rows[0];
    const c = (
      await pg.query<{ id: string }>(
        "insert into candidates(audition_cycle_id,audition_order,first_name,last_name,state) values($1,1,'Persistent','Singer','COMPLETED') returning id",
        [cycle.id],
      )
    ).rows[0];
    const mutate = (operation: string, payload: Record<string, unknown>) =>
      pg!.query('select mutate($1,$2,$3::jsonb)', [user.id, operation, JSON.stringify(payload)]);
    await mutate('patch', {
      id: c.id,
      target: 'evaluation',
      field: 'vibe_notes',
      value: 'Survives reopening the database',
    });
    await mutate('patch', {
      id: c.id,
      target: 'evaluation',
      field: 'overall_rating',
      value: 'GREEN',
    });
    await mutate('deliberate', { cycleId: cycle.id });
    await mutate('move', { id: c.id, status: 'ACCEPTED', section: 'Alto' });
    await pg.close();
    pg = new PGlite(directory);
    expect((await pg.query('select vibe_notes,overall_rating from evaluations')).rows).toEqual([
      { vibe_notes: 'Survives reopening the database', overall_rating: 'GREEN' },
    ]);
    expect(
      (await pg.query('select state,deliberation_status,accepted_section from candidates')).rows,
    ).toEqual([{ state: 'COMPLETED', deliberation_status: 'ACCEPTED', accepted_section: 'Alto' }]);
    expect((await pg.query('select mode from audition_cycles')).rows).toEqual([
      { mode: 'DELIBERATION' },
    ]);
  } finally {
    if (pg) await pg.close();
    await rm(directory, { recursive: true, force: true });
  }
});
