-- Application data is accessible only through the session-authorized server API.
create table public.users (
 id uuid primary key default gen_random_uuid(), display_name text not null unique,
 is_admin boolean not null default false, last_seen_at timestamptz not null default now()
);
create unique index users_name_normalized on public.users(lower(display_name));
create table public.sessions (
 token_hash text primary key, user_id uuid not null references public.users(id),
 expires_at timestamptz not null, unlocked_until timestamptz,
 unlock_attempts integer not null default 0, unlock_window_at timestamptz not null default now()
);
create table public.audition_cycles (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 is_active boolean not null default false, mode text not null default 'AUDITION' check(mode in ('AUDITION','DELIBERATION')),
 created_at timestamptz not null default now()
);
create unique index one_active_cycle on public.audition_cycles(is_active) where is_active;
create table public.candidates (
 id uuid primary key default gen_random_uuid(), audition_cycle_id uuid not null references public.audition_cycles(id),
 audition_order integer not null check(audition_order>0),
 first_name text not null check(length(trim(first_name)) between 1 and 100), last_name text not null check(length(trim(last_name)) between 1 and 100),
 class_year text check(class_year in ('2027','2028','2029','2030','Graduate','DKU','Fuqua')),
 major text not null default '', hometown text not null default '', celebrity_crush text not null default '',
 mbti text not null default '____' check(mbti ~ '^[EI_][SN_][TF_][JP_]$'),
 primary_section text check(primary_section in ('Soprano','Alto','Tenor','Bass')),
 secondary_section text check(secondary_section in ('None','Soprano','Alto','Tenor','Bass')),
 origin_1 text check(origin_1 in ('Mainland China','Hong Kong','Taiwan','Korea','Japan','Vietnam','Philippines','Mongolia','Other')),
 origin_2 text check(origin_2 in ('None','Mainland China','Hong Kong','Taiwan','Korea','Japan','Vietnam','Philippines','Mongolia','Other')),
 origin_1_other text not null default '', origin_2_other text not null default '',
 state text not null default 'UPCOMING' check(state in ('UPCOMING','PERSONAL_INFO','VOCAL_AUDITION','COMPLETED')),
 excluded boolean not null default false, note_taker_id uuid references public.users(id),
 deliberation_status text not null default 'UNDECIDED' check(deliberation_status in ('UNDECIDED','ACCEPTED','REJECTED')),
 accepted_section text check(accepted_section in ('Soprano','Alto','Tenor','Bass')),
 updated_at timestamptz not null default now(),
 unique(audition_cycle_id,audition_order) deferrable initially deferred,
 check(origin_1 is null or origin_2 is null or origin_1<>origin_2 or (origin_1='Other' and lower(trim(origin_1_other))<>lower(trim(origin_2_other)))),
 check((deliberation_status='ACCEPTED')=(accepted_section is not null))
);
create unique index one_live_candidate on public.candidates(audition_cycle_id) where state in ('PERSONAL_INFO','VOCAL_AUDITION') and not excluded;
create table public.evaluations (
 candidate_id uuid not null references public.candidates(id), judge_user_id uuid not null references public.users(id),
   range_rating text check (range_rating in ('GREEN','YELLOW','RED')), range_notes text not null default '' check (length(range_notes)<=20000),
  pitch_rating text check (pitch_rating in ('GREEN','YELLOW','RED')), pitch_notes text not null default '' check (length(pitch_notes)<=20000),
  blending_rating text check (blending_rating in ('GREEN','YELLOW','RED')), blending_notes text not null default '' check (length(blending_notes)<=20000),
  solo_rating text check (solo_rating in ('GREEN','YELLOW','RED')), solo_notes text not null default '' check (length(solo_notes)<=20000),
  vibe_rating text check (vibe_rating in ('GREEN','YELLOW','RED')), vibe_notes text not null default '' check (length(vibe_notes)<=20000),
  overall_rating text check (overall_rating in ('GREEN','YELLOW','RED')), overall_notes text not null default '' check (length(overall_notes)<=20000),
 updated_at timestamptz not null default now(), primary key(candidate_id,judge_user_id)
);
create table public.team_deliberations (
 candidate_id uuid primary key references public.candidates(id),
   range_rating text check (range_rating in ('GREEN','YELLOW','RED')), range_notes text not null default '' check (length(range_notes)<=20000),
  pitch_rating text check (pitch_rating in ('GREEN','YELLOW','RED')), pitch_notes text not null default '' check (length(pitch_notes)<=20000),
  blending_rating text check (blending_rating in ('GREEN','YELLOW','RED')), blending_notes text not null default '' check (length(blending_notes)<=20000),
  solo_rating text check (solo_rating in ('GREEN','YELLOW','RED')), solo_notes text not null default '' check (length(solo_notes)<=20000),
  vibe_rating text check (vibe_rating in ('GREEN','YELLOW','RED')), vibe_notes text not null default '' check (length(vibe_notes)<=20000),
  overall_rating text check (overall_rating in ('GREEN','YELLOW','RED')), overall_notes text not null default '' check (length(overall_notes)<=20000),
 updated_by_user_id uuid references public.users(id), updated_at timestamptz not null default now()
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), audition_cycle_id uuid references public.audition_cycles(id),
 candidate_id uuid references public.candidates(id), user_id uuid references public.users(id),
 event_type text not null, entity_type text not null, entity_id uuid, old_value jsonb, new_value jsonb,
 created_at timestamptz not null default now()
);
-- Only this content-free singleton is published. No candidate IDs, notes, names or ratings.
create table public.change_signal(id integer primary key check(id=1), revision bigint not null default 0);
insert into public.change_signal values(1,0);
create function public.signal_change() returns trigger language plpgsql security definer set search_path=public as $$
begin update public.change_signal set revision=revision+1 where id=1; return null; end $$;
create function public.stamp_updated() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;
grant all on public.users to service_role;
alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated;
grant all on public.sessions to service_role;
alter table public.audition_cycles enable row level security;
revoke all on public.audition_cycles from anon, authenticated;
grant all on public.audition_cycles to service_role;
alter table public.candidates enable row level security;
revoke all on public.candidates from anon, authenticated;
grant all on public.candidates to service_role;
alter table public.evaluations enable row level security;
revoke all on public.evaluations from anon, authenticated;
grant all on public.evaluations to service_role;
alter table public.team_deliberations enable row level security;
revoke all on public.team_deliberations from anon, authenticated;
grant all on public.team_deliberations to service_role;
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant all on public.audit_events to service_role;
alter table public.change_signal enable row level security;
revoke all on public.change_signal from anon, authenticated;
grant all on public.change_signal to service_role;
create trigger signal_change after insert or update or delete on public.audition_cycles for each statement execute function public.signal_change();
create trigger signal_change after insert or update or delete on public.candidates for each statement execute function public.signal_change();
create trigger signal_change after insert or update or delete on public.evaluations for each statement execute function public.signal_change();
create trigger signal_change after insert or update or delete on public.team_deliberations for each statement execute function public.signal_change();
create trigger stamp_updated before update on public.candidates for each row execute function public.stamp_updated();
create trigger stamp_updated before update on public.evaluations for each row execute function public.stamp_updated();
create trigger stamp_updated before update on public.team_deliberations for each row execute function public.stamp_updated();
grant select on public.change_signal to anon, authenticated;
create policy read_signal on public.change_signal for select to anon, authenticated using(true);
alter publication supabase_realtime add table public.change_signal;

create function public.login_identity(normalized_name text) returns public.users language plpgsql security definer set search_path=public as $$
declare u public.users;
begin
 if length(trim(normalized_name)) not between 1 and 80 then raise exception 'Name must contain 1–80 characters'; end if;
 insert into public.users(display_name,is_admin) values(normalized_name, normalized_name in ('Lucas','Admin'))
 on conflict (display_name) do update set last_seen_at=now(), is_admin=users.is_admin or excluded.is_admin returning * into u;
 return u;
end $$;
create function public.consume_unlock_attempt(session_hash text) returns boolean language plpgsql security definer set search_path=public as $$
declare s public.sessions;
begin
 select * into s from sessions where token_hash=session_hash and expires_at>now() for update;
 if not found then return false; end if;
 if s.unlock_window_at < now()-interval '15 minutes' then
 update sessions set unlock_attempts=1,unlock_window_at=now() where token_hash=session_hash; return true;
 end if;
 if s.unlock_attempts>=10 then return false; end if;
 update sessions set unlock_attempts=unlock_attempts+1 where token_hash=session_hash; return true;
end $$;

-- Every mutation is atomic, serializes cycle workflow, and checks the database admin flag.
-- Only service_role may invoke this function; actor_id comes from an opaque server session.
create function public.mutate(actor_id uuid, operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 u public.users; c public.candidates; cy public.audition_cycles; result jsonb;
 target_id uuid; field_name text; target_table text; old jsonb; n integer; current_order integer;
begin
 select * into u from users where id=actor_id;
 if not found then raise exception 'Unknown identity'; end if;
 if operation in ('createCycle','activateCycle','createCandidate','reorder','start','close','exclude','restore','deliberate') and not u.is_admin then
 raise exception 'Admin required' using errcode='42501';
 end if;
 if operation='createCycle' then
 insert into audition_cycles(name) values(payload->>'name') returning to_jsonb(audition_cycles.*) into result;
 elsif operation='activateCycle' then
 perform pg_advisory_xact_lock(810231);
 update audition_cycles set is_active=false where is_active;
 update audition_cycles set is_active=true where id=(payload->>'id')::uuid returning to_jsonb(audition_cycles.*) into result;
 if result is null then raise exception 'Cycle not found'; end if;
 elsif operation in ('createCandidate','deliberate','reorder') then
 select * into cy from audition_cycles where id=(payload->>'cycleId')::uuid for update;
 if not found then raise exception 'Cycle not found'; end if;
 if operation='createCandidate' then
 select coalesce(max(audition_order),0)+1 into n from candidates where audition_cycle_id=cy.id;
 insert into candidates(audition_cycle_id,audition_order,first_name,last_name) values(cy.id,n,payload->>'first_name',payload->>'last_name') returning to_jsonb(candidates.*) into result;
 elsif operation='deliberate' then
 update audition_cycles set mode='DELIBERATION' where id=cy.id returning to_jsonb(audition_cycles.*) into result;
 else
 if jsonb_array_length(payload->'ids')<>(select count(*) from candidates where audition_cycle_id=cy.id)
 or (select count(distinct value) from jsonb_array_elements_text(payload->'ids'))<>jsonb_array_length(payload->'ids')
 or exists(select 1 from jsonb_array_elements_text(payload->'ids') a where not exists(select 1 from candidates where id=a.value::uuid and audition_cycle_id=cy.id)) then raise exception 'Provide every candidate exactly once'; end if;
 update candidates set audition_order=a.ordinality from jsonb_array_elements_text(payload->'ids') with ordinality a where candidates.id=a.value::uuid and audition_cycle_id=cy.id;
 result='{}'::jsonb;
 end if;
 else
 target_id=(payload->>'id')::uuid;
 -- Lock cycle first everywhere to avoid workflow races and lock-order deadlocks.
 select ac.* into cy from audition_cycles ac join candidates ca on ca.audition_cycle_id=ac.id where ca.id=target_id for update of ac;
 select * into c from candidates where id=target_id for update;
 if not found then raise exception 'Candidate not found'; end if;
 if c.excluded and not u.is_admin then raise exception 'Candidate unavailable' using errcode='42501'; end if;
 old=to_jsonb(c);
 if operation='start' then
 if cy.mode<>'AUDITION' or c.state<>'UPCOMING' or c.excluded then raise exception 'Only upcoming candidates in audition mode can start'; end if;
 if not exists(select 1 from users where id=(payload->>'noteTakerId')::uuid and last_seen_at>now()-interval '5 minutes') then raise exception 'Select a currently connected note taker'; end if;
 update candidates set state='PERSONAL_INFO',note_taker_id=(payload->>'noteTakerId')::uuid where id=c.id;
 elsif operation='advance' then
 if c.state<>'PERSONAL_INFO' or (c.note_taker_id is distinct from actor_id and not u.is_admin) then raise exception 'Only the note taker or admin may advance Personal Info' using errcode='42501'; end if;
 if not (u.is_admin and coalesce((payload->>'force')::boolean,false)) and
 (c.class_year is null or trim(c.major)='' or trim(c.hometown)='' or trim(c.celebrity_crush)='' or c.mbti !~ '^[EI][SN][TF][JP]$') then
 raise exception 'Complete all Personal Info fields';
 end if;
 update candidates set state='VOCAL_AUDITION' where id=c.id;
 elsif operation='close' then
 if c.state<>'VOCAL_AUDITION' then raise exception 'Candidate must be in Vocal Audition'; end if;
 update candidates set state='COMPLETED' where id=c.id;
 elsif operation in ('exclude','restore') then
 update candidates set excluded=(operation='exclude') where id=c.id;
 elsif operation='move' then
 if cy.mode<>'DELIBERATION' or c.excluded then raise exception 'Deliberation required'; end if;
 update candidates set deliberation_status=payload->>'status',accepted_section=payload->>'section' where id=c.id;
 elsif operation='patch' then
 field_name=payload->>'field';
 if payload->>'target'='profile' then
 if c.state='UPCOMING' and cy.mode<>'DELIBERATION' then raise exception 'Start Personal Info first'; end if;
 if c.state='PERSONAL_INFO' and c.note_taker_id is distinct from actor_id and not u.is_admin and cy.mode<>'DELIBERATION' then raise exception 'Only designated note taker may edit Personal Info' using errcode='42501'; end if;
 if field_name not in ('first_name','last_name','class_year','major','hometown','celebrity_crush','mbti','primary_section','secondary_section','origin_1','origin_2','origin_1_other','origin_2_other') then raise exception 'Invalid profile field'; end if;
 if c.state='PERSONAL_INFO' and field_name in ('primary_section','secondary_section','origin_1','origin_2','origin_1_other','origin_2_other') then raise exception 'Collect these fields after Personal Info'; end if;
 if length(payload->>'value')>500 then raise exception 'Profile value too long'; end if;
 execute format('update candidates set %I=$1 where id=$2',field_name) using payload->>'value',c.id;
 elsif payload->>'target' in ('evaluation','team') then
 if field_name !~ '^(range|pitch|blending|solo|vibe|overall)_(rating|notes)$' then raise exception 'Invalid evaluation field'; end if;
 if payload->>'target'='team' then
 if cy.mode<>'DELIBERATION' or c.excluded then raise exception 'Deliberation required'; end if;
 insert into team_deliberations(candidate_id) values(c.id) on conflict do nothing;
 execute format('update team_deliberations set %I=$1,updated_by_user_id=$2 where candidate_id=$3',field_name) using payload->>'value',actor_id,c.id;
 else
 if c.state not in ('VOCAL_AUDITION','COMPLETED') and cy.mode<>'DELIBERATION' then raise exception 'Vocal Audition has not begun'; end if;
 insert into evaluations(candidate_id,judge_user_id) values(c.id,actor_id) on conflict do nothing;
 execute format('update evaluations set %I=$1 where candidate_id=$2 and judge_user_id=$3',field_name) using payload->>'value',c.id,actor_id;
 end if;
 else raise exception 'Invalid patch target'; end if;
 else raise exception 'Unknown operation'; end if;
 select to_jsonb(candidates.*) into result from candidates where id=c.id;
 end if;
 insert into audit_events(audition_cycle_id,candidate_id,user_id,event_type,entity_type,entity_id,old_value,new_value)
 values(coalesce(cy.id,(result->>'audition_cycle_id')::uuid),c.id,actor_id,operation,case when operation='patch' then payload->>'target' else 'workflow' end,coalesce(c.id,(result->>'id')::uuid),
 case when operation<>'patch' then old else null end,
 case when operation='patch' then jsonb_build_object('field',payload->>'field') else result end);
 return coalesce(result,'{}'::jsonb);
end $$;
revoke all on function public.login_identity(text),public.consume_unlock_attempt(text),public.mutate(uuid,text,jsonb),public.signal_change(),public.stamp_updated() from public,anon,authenticated;
grant execute on function public.login_identity(text),public.consume_unlock_attempt(text),public.mutate(uuid,text,jsonb) to service_role;
