import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
const url = process.env.DATABASE_URL;
if (!url)
  throw new Error(
    'Set DATABASE_URL in .env.local to the Supabase direct or session-pooler connection string.',
  );
const sql = postgres(url, { max: 1, ssl: 'require', connect_timeout: 8 });
try {
  await sql`create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public.app_migrations enable row level security`;
  await sql`revoke all on public.app_migrations from anon, authenticated`;
  for (const file of (await readdir('supabase/migrations'))
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    const applied = await sql`select 1 from public.app_migrations where name=${file}`;
    if (applied.length) continue;
    const source = await readFile(`supabase/migrations/${file}`, 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`insert into public.app_migrations(name) values(${file})`;
    });
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
