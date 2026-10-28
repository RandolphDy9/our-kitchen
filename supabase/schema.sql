-- OurKitchen schema for Supabase (free tier). Paste into Dashboard → SQL Editor → Run.
-- Safe to re-run. The super admin email below must match NEXT_PUBLIC_OWNER_EMAIL.

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

-- ---------- Roles ----------
create or replace function public.ok_uid() returns text
  language sql stable as $$ select coalesce(auth.uid()::text, '') $$;

create or replace function public.ok_email() returns text
  language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.ok_is_owner() returns boolean
  language sql stable as $$ select public.ok_email() = 'mayson.dy@gmail.com' $$;

-- Admins: roles/{uid}, where uid is the guest identity a player checked in with.
create or replace function public.ok_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.ok_is_owner()
      or (public.ok_uid() <> '' and exists (select 1 from public.docs where col = 'roles' and id = public.ok_uid()))
$$;

-- Collections only admins write: events, matches, roster, brackets, imported schedule
create or replace function public.ok_admin_col(c text) returns boolean
  language sql immutable as $$
  select c = 'events' or c like 'events/%/matches' or c like 'roster/%' or c like 'playoffs/%' or c like 'sched/%'
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

-- ---------- Policies ----------
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated using (true);

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated with check (
  case
    when col = 'roles' then public.ok_is_owner()
    when public.ok_admin_col(col) then public.ok_is_admin()
    when col like 'checkins/%' then public.ok_is_admin() or (data ->> 'uid' = public.ok_uid() and public.ok_checkin_open(col))
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid()
      and (col not like 'photocomments/%' or length(coalesce(data ->> 'text', '')) <= 280)
    when col like 'gallery/%' then data ->> 'uploaderUid' = public.ok_uid()
    else false
  end
);

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
using (
  case
    when col = 'roles' then public.ok_is_owner()
    when public.ok_admin_col(col) then public.ok_is_admin()
    -- a player can claim a spot nobody else has claimed
    when col like 'checkins/%' then public.ok_is_admin() or coalesce(data ->> 'uid', '') in ('', public.ok_uid())
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid()
    else false
  end
)
with check (
  case
    when col = 'roles' then public.ok_is_owner()
    when public.ok_admin_col(col) then public.ok_is_admin()
    when col like 'checkins/%' then public.ok_is_admin() or (data ->> 'uid' = public.ok_uid() and public.ok_checkin_open(col))
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid()
    else false
  end
);

drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated using (
  case
    when col = 'roles' then public.ok_is_owner()
    when public.ok_admin_col(col) then public.ok_is_admin()
    when col like 'checkins/%' then public.ok_is_admin()
    when public.ok_social_col(col) then data ->> 'uid' = public.ok_uid() or public.ok_is_admin()
    when col like 'gallery/%' then data ->> 'uploaderUid' = public.ok_uid() or public.ok_is_admin()
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
-- Public bucket: photo URLs are random and unguessable, which keeps the gallery fast and free.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/*'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (bucket_id = 'photos');

drop policy if exists photos_upload on storage.objects;
create policy photos_upload on storage.objects for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (owner_id = auth.uid()::text or public.ok_is_admin()));
