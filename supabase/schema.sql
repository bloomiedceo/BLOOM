-- BLOOM Supabase starter schema
-- Run this in Supabase SQL Editor before enabling the public frontend.
-- Review policies before a public launch. This file intentionally does not create storage buckets or public media uploads.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,40}$'),
  display_name text not null default 'New fan' check (char_length(display_name) between 1 and 50),
  bio text not null default '' check (char_length(bio) <= 240),
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.bloom_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_name text;
begin
  base_name := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'username', 'fan')), '[^a-z0-9_]', '', 'g');
  if char_length(base_name) < 3 then base_name := 'fan'; end if;
  insert into public.profiles(id, username, display_name)
  values (
    new.id,
    left(base_name, 24) || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''), base_name), 50)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists bloom_auth_user_created on auth.users;
create trigger bloom_auth_user_created
after insert on auth.users
for each row execute procedure public.bloom_create_profile();

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 2000),
  fandom text not null default 'Multi-stan' check (char_length(fandom) <= 60),
  link text check (link is null or (char_length(link) <= 2048 and link ~ '^https?://')),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 70),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

create or replace function public.bloom_add_group_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members(group_id,user_id,role) values (new.id,new.owner_id,'owner')
  on conflict (group_id,user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists bloom_group_owner_member on public.groups;
create trigger bloom_group_owner_member
after insert on public.groups
for each row execute procedure public.bloom_add_group_owner();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists bloom_posts_created_idx on public.posts(created_at desc);
create index if not exists bloom_messages_group_created_idx on public.messages(group_id, created_at);
create index if not exists bloom_group_members_user_idx on public.group_members(user_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','message','group','profile')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 80),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- Remove named policies first so this script can be re-run.
drop policy if exists "profiles read public or own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "posts read public or own" on public.posts;
drop policy if exists "posts create own" on public.posts;
drop policy if exists "posts update own or moderator" on public.posts;
drop policy if exists "posts delete own or moderator" on public.posts;
drop policy if exists "groups read public or member" on public.groups;
drop policy if exists "groups create as self" on public.groups;
drop policy if exists "groups update owner or moderator" on public.groups;
drop policy if exists "members read own" on public.group_members;
drop policy if exists "members join public group" on public.group_members;
drop policy if exists "members leave or owner removes" on public.group_members;
drop policy if exists "messages read members" on public.messages;
drop policy if exists "messages create as member" on public.messages;
drop policy if exists "messages delete own or moderator" on public.messages;
drop policy if exists "reports create own" on public.reports;
drop policy if exists "reports read own or moderator" on public.reports;
drop policy if exists "reports update moderator" on public.reports;

create policy "profiles read public or own" on public.profiles
for select to anon, authenticated
using (is_private = false or id = (select auth.uid()));

create policy "profiles update own" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "posts read public or own" on public.posts
for select to anon, authenticated
using (
  author_id = (select auth.uid())
  or (
    status = 'published'
    and exists (select 1 from public.profiles p where p.id = author_id and p.is_private = false)
  )
);

create policy "posts create own" on public.posts
for insert to authenticated
with check (author_id = (select auth.uid()) and status = 'published');

create policy "posts update own or moderator" on public.posts
for update to authenticated
using (author_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator')
with check (author_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');

create policy "posts delete own or moderator" on public.posts
for delete to authenticated
using (author_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');

create policy "groups read public or member" on public.groups
for select to authenticated
using (
  is_public = true
  or owner_id = (select auth.uid())
  or exists (select 1 from public.group_members gm where gm.group_id = id and gm.user_id = (select auth.uid()))
);

create policy "groups create as self" on public.groups
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "groups update owner or moderator" on public.groups
for update to authenticated
using (owner_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator')
with check (owner_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');

create policy "members read own" on public.group_members
for select to authenticated
using (user_id = (select auth.uid()));

create policy "members join public group" on public.group_members
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.groups g where g.id = group_id and (g.is_public = true or g.owner_id = (select auth.uid())))
);

create policy "members leave or owner removes" on public.group_members
for delete to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator'
);

create policy "messages read members" on public.messages
for select to authenticated
using (exists (select 1 from public.group_members gm where gm.group_id = public.messages.group_id and gm.user_id = (select auth.uid())));

create policy "messages create as member" on public.messages
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.group_members gm where gm.group_id = public.messages.group_id and gm.user_id = (select auth.uid()))
);

create policy "messages delete own or moderator" on public.messages
for delete to authenticated
using (author_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');

create policy "reports create own" on public.reports
for insert to authenticated
with check (reporter_id = (select auth.uid()));

create policy "reports read own or moderator" on public.reports
for select to authenticated
using (reporter_id = (select auth.uid()) or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');

create policy "reports update moderator" on public.reports
for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator');


-- SQL privileges are necessary in addition to RLS; policies remain the row-level gate.
grant select on public.profiles, public.posts to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.posts to authenticated;
grant select, insert, update on public.groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update on public.reports to authenticated;

-- Enable Realtime for shared group messages. If this fails because the table is already in the publication,
-- leave it enabled in Supabase Dashboard > Database > Publications > supabase_realtime.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
