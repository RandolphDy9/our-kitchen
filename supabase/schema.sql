-- Qsina schema for Supabase (free tier). Paste into Dashboard → SQL Editor → Run.
-- Safe to re-run. The platform owner email below must match NEXT_PUBLIC_OWNER_EMAIL.

-- ---------- Documents ----------
-- Same document model the app always used: a collection path (col), a doc id, and its JSON.
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
alter table public.docs enable row level security;

do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- ---------- Who's who ----------
create or replace function public.ok_uid() returns text
  language sql stable as $$ select coalesce(auth.uid()::text, '') $$;

create or replace function public.ok_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Platform owner: manages every club.
create or replace function public.ok_is_owner() returns boolean
  language sql stable as $$ select public.ok_email() = 'mayson.dy@gmail.com' $$;

-- Clubs: clubs/{clubId} = { name }. Each event's data has a clubId.
-- Members: members/{clubId}/{key} = { role: "owner" | "admin", name, ... }, where key is
--   "e:{email}" for people who sign in with email + password (club owners), or
--   "{uid}" for helpers picked from checked-in players (the guest identity on their phone).
create or replace function public.ok_member_role(club text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select data ->> 'role' from public.docs
    where col = 'members/' || club
      and ((public.ok_email() <> '' and id = 'e:' || public.ok_email()) or (public.ok_uid() <> '' and id = public.ok_uid()))
    order by (data ->> 'role') = 'owner' desc limit 1), '')
$$;

create or replace function public.ok_is_club_owner(club text) returns boolean
  language sql stable as $$ select public.ok_is_owner() or public.ok_member_role(club) = 'owner' $$;

create or replace function public.ok_is_club_admin(club text) returns boolean
  language sql stable as $$ select public.ok_is_owner() or public.ok_member_role(club) in ('owner', 'admin') $$;

create or replace function public.ok_event_club(ev text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select data ->> 'clubId' from public.docs where col = 'events' and id = ev), '')
$$;

-- Admin of the club that runs this event.
create or replace function public.ok_is_event_admin(ev text) returns boolean
  language sql stable as $$ select public.ok_is_club_admin(public.ok_event_club(ev)) $$;

-- Per-event collections only admins write: matches, roster, brackets, imported schedule.
-- They're all "{kind}/{eventId}/{…}", so split_part(col, '/', 2) is the event.
create or replace function public.ok_admin_col(c text) returns boolean
  language sql immutable as $$
  select c like 'events/%/matches' or c like 'roster/%' or c like 'playoffs/%' or c like 'sched/%'
$$;

-- Players check themselves in from 1 hour before the event's start (admins any time).
-- c is "checkins/{eventId}/in"; the event's date + start are local times in its tz.
create or replace function public.ok_checkin_open(c text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select now() >= ((e.data ->> 'date') || ' ' || (e.data ->> 'start'))::timestamp
                     at time zone coalesce(nullif(e.data ->> 'tz', ''), 'America/Toronto') - interval '1 hour'
    from public.docs e where e.col = 'events' and e.id = split_part(c, '/', 2)
  ), false)
$$;

-- Reactions, hearts and comments: everyone adds their own, only they (or an admin) take it back
create or replace function public.ok_social_col(c text) returns boolean
  language sql immutable as $$
  select c like 'kudos/%' or c like 'photolikes/%' or c like 'photocomments/%'
$$;

-- The player this person checked in as at an event ('' if none).
create or replace function public.ok_my_player(ev text) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select id from public.docs
    where public.ok_uid() <> '' and col = 'checkins/' || ev || '/in' and data ->> 'uid' = public.ok_uid() limit 1), '')
$$;

-- Photos in an event's gallery for one player (5 each).
create or replace function public.ok_photo_count(gcol text, player text) returns int
  language sql stable security definer set search_path = public as $$
  select count(*)::int from public.docs where col = gcol and data ->> 'playerId' = player
$$;

-- Photo files this person has uploaded to an event's folder.
create or replace function public.ok_my_files(folder text) returns int
  language sql stable security definer set search_path = public as $$
  select count(*)::int from storage.objects
  where bucket_id = 'photos' and owner_id = auth.uid()::text and name like folder || '/%'
$$;

-- Players "join" an event by opening its QR code or link, or typing its check-in code (joins/{eventId}/{uid}).
-- The code is separate from the event id on purpose: ids show up in realtime delete notices sent to everyone,
-- so an id must never be enough to read an event.
create or replace function public.ok_joined(ev text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.ok_uid() <> '' and exists (select 1 from public.docs where col = 'joins/' || ev and id = public.ok_uid())
$$;

-- Who can see an event and everything in it: its club's owners and admins, and people who joined it.
create or replace function public.ok_can_read_event(ev text) returns boolean
  language sql stable as $$ select public.ok_is_event_admin(ev) or public.ok_joined(ev) $$;

-- ---------- Policies ----------
-- Reads are private: each club sees its own clubs, members and events; players see only events they joined.
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated using (
  case
    when col = 'clubs' then public.ok_is_owner() or public.ok_member_role(id) <> ''
    when col like 'members/%' then public.ok_is_club_admin(split_part(col, '/', 2))
      or (public.ok_uid() <> '' and id = public.ok_uid()) or (public.ok_email() <> '' and id = 'e:' || public.ok_email())
    when col = 'events' then public.ok_is_club_admin(coalesce(data ->> 'clubId', '')) or public.ok_joined(id)
    when col like 'joins/%' then (public.ok_uid() <> '' and id = public.ok_uid()) or public.ok_is_event_admin(split_part(col, '/', 2))
    -- Every other collection belongs to one event: "{kind}/{eventId}/…".
    when col like '%/%' then public.ok_can_read_event(split_part(col, '/', 2))
    else false
  end
);

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated with check (
  case
    when col = 'clubs' then public.ok_is_owner()
    -- joins/… are only written by ok_join(), which checks the event's check-in code.
    -- Only the platform owner names club owners; club owners add their admins.
    when col like 'members/%' then data ->> 'role' in ('owner', 'admin') and case
      when data ->> 'role' = 'owner' then public.ok_is_owner() else public.ok_is_club_owner(split_part(col, '/', 2)) end
    when col = 'events' then public.ok_is_club_admin(coalesce(data ->> 'clubId', ''))
    when public.ok_admin_col(col) then public.ok_is_event_admin(split_part(col, '/', 2))
    when col like 'checkins/%' then public.ok_is_event_admin(split_part(col, '/', 2))
      or (data ->> 'uid' = public.ok_uid() and public.ok_checkin_open(col))
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid()
      and (col not like 'photocomments/%' or length(coalesce(data ->> 'text', '')) <= 280)
    when col like 'gallery/%' then data ->> 'uploaderUid' = public.ok_uid()
      and (public.ok_is_event_admin(split_part(col, '/', 2)) or data ->> 'playerId' = public.ok_my_player(split_part(col, '/', 2)))
      and public.ok_photo_count(col, data ->> 'playerId') < 5
    else false
  end
);

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
using (
  case
    when col = 'clubs' then public.ok_is_club_owner(id)
    when col like 'members/%' then public.ok_is_owner() or (public.ok_is_club_owner(split_part(col, '/', 2)) and data ->> 'role' = 'admin')
    when col = 'events' then public.ok_is_club_admin(coalesce(data ->> 'clubId', ''))
    when public.ok_admin_col(col) then public.ok_is_event_admin(split_part(col, '/', 2))
    -- a player can claim a spot nobody else has claimed
    when col like 'checkins/%' then public.ok_is_event_admin(split_part(col, '/', 2)) or coalesce(data ->> 'uid', '') in ('', public.ok_uid())
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid()
    else false
  end
)
with check (
  case
    when col = 'clubs' then public.ok_is_club_owner(id)
    when col like 'members/%' then data ->> 'role' in ('owner', 'admin') and (public.ok_is_owner()
      or (public.ok_is_club_owner(split_part(col, '/', 2)) and data ->> 'role' = 'admin'))
    -- An event can only move to a club this person also runs.
    when col = 'events' then public.ok_is_club_admin(coalesce(data ->> 'clubId', ''))
    when public.ok_admin_col(col) then public.ok_is_event_admin(split_part(col, '/', 2))
    when col like 'checkins/%' then public.ok_is_event_admin(split_part(col, '/', 2))
      or (data ->> 'uid' = public.ok_uid() and public.ok_checkin_open(col))
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid()
    else false
  end
);

drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated using (
  case
    when col = 'clubs' then public.ok_is_owner()
    when col like 'members/%' then public.ok_is_owner() or (public.ok_is_club_owner(split_part(col, '/', 2)) and data ->> 'role' = 'admin')
    when col = 'events' then public.ok_is_club_admin(coalesce(data ->> 'clubId', ''))
    when public.ok_admin_col(col) then public.ok_is_event_admin(split_part(col, '/', 2))
    when col like 'checkins/%' then public.ok_is_event_admin(split_part(col, '/', 2))
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid() or public.ok_is_event_admin(split_part(col, '/', 2))
    when col like 'gallery/%' then data ->> 'uploaderUid' = public.ok_uid() or public.ok_is_event_admin(split_part(col, '/', 2))
    else false
  end
);

-- Shallow merge, like Firestore's update(): top-level fields in p_data replace the old ones.
create or replace function public.doc_merge(p_col text, p_id text, p_data jsonb) returns void
  language plpgsql security invoker set search_path = public as $$
begin
  update public.docs set data = data || p_data, updated_at = now() where col = p_col and id = p_id;
  if not found then
    raise exception 'Document % / % not found or not allowed', p_col, p_id using errcode = 'P0002';
  end if;
end $$;

-- ---------- Photos ----------
-- Private bucket: the app shows photos through signed links that expire, and only people who can see the event
-- (its club's admins, and players who joined it) can get those links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/*'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.ok_can_read_event((storage.foldername(name))[1]));

drop policy if exists photos_upload on storage.objects;
-- Uploads go to "{eventId}/…": admins, or players checked in to that event, 5 files each.
create policy photos_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and (public.ok_is_event_admin((storage.foldername(name))[1]) or (
    public.ok_my_player((storage.foldername(name))[1]) <> ''
    and public.ok_my_files((storage.foldername(name))[1]) < 5
  ))
);

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (owner_id = auth.uid()::text or public.ok_is_event_admin((storage.foldername(name))[1])));

-- ---------- Moving a check-in to another app or phone ----------
-- On iPhone a Home Screen app keeps its own storage, so a player who checked in in Safari is a stranger there.
-- The device holding the check-in shows a 4-digit code and the new one enters it. Codes last 10 minutes, 5 tries.
create table if not exists public.checkin_moves (
  col text not null,
  id text not null,
  uid text not null,
  code text not null,
  tries int not null default 0,
  expires timestamptz not null,
  primary key (col, id)
);
alter table public.checkin_moves enable row level security;
-- No policies on purpose: only the two functions below read or write it.

create or replace function public.ok_move_code(p_col text, p_id text) returns text
  language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  if p_col not like 'checkins/%' or public.ok_uid() = '' or not exists (
    select 1 from public.docs where col = p_col and id = p_id and data ->> 'uid' = public.ok_uid()
  ) then
    raise exception 'Not your check-in' using errcode = '42501';
  end if;
  c := lpad(floor(random() * 10000)::int::text, 4, '0');
  insert into public.checkin_moves (col, id, uid, code, tries, expires)
  values (p_col, p_id, public.ok_uid(), c, 0, now() + interval '10 minutes')
  on conflict (col, id) do update set uid = excluded.uid, code = excluded.code, tries = 0, expires = excluded.expires;
  return c;
end $$;

create or replace function public.ok_move_checkin(p_col text, p_id text, p_code text) returns boolean
  language plpgsql volatile security definer set search_path = public as $$
declare m public.checkin_moves; me text := public.ok_uid();
begin
  if me = '' then return false; end if;
  select * into m from public.checkin_moves where col = p_col and id = p_id for update;
  if not found or m.expires < now() then return false; end if;
  if m.code <> trim(p_code) then
    if m.tries >= 4 then delete from public.checkin_moves where col = p_col and id = p_id;
    else update public.checkin_moves set tries = tries + 1 where col = p_col and id = p_id; end if;
    return false;
  end if;
  update public.docs set data = data || jsonb_build_object('uid', me), updated_at = now()
    where col = p_col and id = p_id and data ->> 'uid' = m.uid;
  -- A club admin stays an admin on the new device, in every club they help run.
  if m.uid <> me then
    insert into public.docs (col, id, data)
      select col, me, data from public.docs where col like 'members/%' and id = m.uid
      on conflict (col, id) do update set data = excluded.data, updated_at = now();
    delete from public.docs where col like 'members/%' and id = m.uid;
  end if;
  delete from public.checkin_moves where col = p_col and id = p_id;
  return true;
end $$;

-- ---------- One-time move to clubs (safe to re-run) ----------
-- There's always at least one club ("My club" until it's renamed in the app). Events made before clubs
-- existed join the first club, and the old admins (roles/{uid}) become that club's admins.
do $$
declare first_club text;
begin
  if not exists (select 1 from public.docs where col = 'clubs') then
    insert into public.docs (col, id, data) values ('clubs', 'main', jsonb_build_object('name', 'My club', 'createdAt', now()));
  end if;
  if exists (select 1 from public.docs where col = 'events' and coalesce(data ->> 'clubId', '') = '')
     or exists (select 1 from public.docs where col = 'roles') then
    select id into first_club from public.docs where col = 'clubs' order by updated_at, id limit 1;
    update public.docs set data = data || jsonb_build_object('clubId', first_club), updated_at = now()
      where col = 'events' and coalesce(data ->> 'clubId', '') = '';
    insert into public.docs (col, id, data)
      select 'members/' || first_club, id, data || '{"role": "admin"}'::jsonb from public.docs where col = 'roles'
      on conflict (col, id) do nothing;
    delete from public.docs where col = 'roles';
  end if;
end $$;

-- The old admin check, replaced by the club ones above.
drop function if exists public.ok_is_admin();

-- ---------- Joining an event with its check-in code ----------
-- Returns the event id, or null when no event has that code. Events made before codes existed use their id.
create or replace function public.ok_join(p_code text) returns text
  language plpgsql volatile security definer set search_path = public as $$
declare ev text; me text := public.ok_uid();
begin
  if me = '' or coalesce(trim(p_code), '') = '' then return null; end if;
  select id into ev from public.docs where col = 'events' and lower(data ->> 'code') = lower(trim(p_code)) limit 1;
  if ev is null then return null; end if;
  insert into public.docs (col, id, data) values ('joins/' || ev, me, jsonb_build_object('at', now()))
    on conflict (col, id) do nothing;
  return ev;
end $$;

-- Events from before check-in codes keep working with their id as the code (already printed QR posters).
update public.docs set data = data || jsonb_build_object('code', id), updated_at = now()
  where col = 'events' and coalesce(data ->> 'code', '') = '';
