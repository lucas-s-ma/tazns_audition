alter table public.audition_cycles
  add column if not exists deliberation_active boolean not null default false;

update public.audition_cycles
set deliberation_active = (mode = 'DELIBERATION')
where deliberation_active = false and mode = 'DELIBERATION';

create or replace function public.toggle_deliberation(actor_id uuid, cycle_id uuid, active boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u public.users; result jsonb;
begin
  select * into u from users where id = actor_id;
  if not found or not u.is_admin then raise exception 'Admin required' using errcode='42501'; end if;
  update audition_cycles
    set deliberation_active = active,
        mode = case when active then 'DELIBERATION' else 'AUDITION' end
    where id = cycle_id
    returning to_jsonb(audition_cycles.*) into result;
  if result is null then raise exception 'Cycle not found'; end if;
  return result;
end $$;

revoke all on function public.toggle_deliberation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.toggle_deliberation(uuid,uuid,boolean) to service_role;
