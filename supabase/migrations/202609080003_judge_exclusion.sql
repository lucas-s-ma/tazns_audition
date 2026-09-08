alter table public.users
  add column if not exists excluded boolean not null default false;

create or replace function public.set_judge_excluded(actor_id uuid, judge_id uuid, excluded boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.users; judge public.users; result jsonb;
begin
  select * into actor from users where id = actor_id;
  if not found or not actor.is_admin then
    raise exception 'Admin required' using errcode='42501';
  end if;

  select * into judge from users where id = judge_id for update;
  if not found then raise exception 'Judge account not found'; end if;
  if judge.is_admin then
    raise exception 'Admin accounts cannot be excluded' using errcode='42501';
  end if;

  update users set excluded = set_judge_excluded.excluded where id = judge_id
  returning to_jsonb(users.*) into result;
  return result;
end $$;

revoke all on function public.set_judge_excluded(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_judge_excluded(uuid,uuid,boolean) to service_role;
