-- Run ONLY in the restored destination project after pg_restore --no-acl.
begin;
do $$
declare t text;
begin
 foreach t in array array['users','sessions','audition_cycles','candidates','evaluations','team_deliberations','audit_events','change_signal'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 if to_regclass('public.app_migrations') is not null then
 alter table public.app_migrations enable row level security;
 revoke all on public.app_migrations from anon,authenticated;
 end if;
end $$;
grant select on public.change_signal to anon,authenticated;
revoke all on function public.login_identity(text),public.consume_unlock_attempt(text),public.mutate(uuid,text,jsonb),public.signal_change(),public.stamp_updated() from public,anon,authenticated;
grant execute on function public.login_identity(text),public.consume_unlock_attempt(text),public.mutate(uuid,text,jsonb) to service_role;
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='change_signal') then
 alter publication supabase_realtime add table public.change_signal;
 end if;
end $$;
delete from public.sessions;
commit;
