import postgres from 'postgres';
if (process.env.CONFIRM_DEV_SEED !== 'yes')
  throw new Error(
    'Development only. Run CONFIRM_DEV_SEED=yes npm run db:seed against a development project.',
  );
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require', connect_timeout: 8 });
try {
  await sql.begin(async (tx) => {
    if ((await tx`select 1 from audition_cycles limit 1`).length)
      throw new Error('Seed requires an empty project to avoid changing live data.');
    for (const name of ['Lucas', 'Admin', 'Alice', 'Ben', 'Chloe'])
      await tx`select login_identity(${name})`;
    const [admin] = await tx`select id from users where display_name='Lucas'`;
    const [cycle] =
      await tx`insert into audition_cycles(name,is_active) values('Development · Fall 2026',true) returning id`;
    const names = [
      ['Jamie', 'Chen', 'COMPLETED'],
      ['Alex', 'Park', 'VOCAL_AUDITION'],
      ['Jordan', 'Nguyen', 'UPCOMING'],
      ['Morgan', 'Lee', 'UPCOMING'],
    ];
    for (let i = 0; i < names.length; i++) {
      const [first, last, state] = names[i];
      const [c] =
        await tx`insert into candidates(audition_cycle_id,audition_order,first_name,last_name,state,note_taker_id) values(${cycle.id},${i + 1},${first},${last},${state},${admin.id}) returning id`;
      if (i === 0)
        await tx`insert into evaluations(candidate_id,judge_user_id,overall_rating,solo_notes) values(${c.id},${admin.id},'GREEN','Warm tone and confident phrasing.')`;
    }
  });
  console.log('Explicit development seed inserted.');
} finally {
  await sql.end();
}
