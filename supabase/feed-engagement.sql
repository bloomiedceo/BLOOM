-- BLOOM shared-feed engagement migration
-- Run after supabase/schema.sql in the Supabase SQL Editor.
-- No service-role key is required by the browser.

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);

create index if not exists bloom_post_comments_created_idx
  on public.post_comments(post_id, created_at);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists "post likes read own" on public.post_likes;
drop policy if exists "post likes create own" on public.post_likes;
drop policy if exists "post likes delete own" on public.post_likes;
drop policy if exists "post comments read visible posts" on public.post_comments;
drop policy if exists "post comments create own" on public.post_comments;
drop policy if exists "post comments delete own or moderator" on public.post_comments;

create policy "post likes read own" on public.post_likes
for select to authenticated
using (user_id = (select auth.uid()));

create policy "post likes create own" on public.post_likes
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.status = 'published'
  )
);

create policy "post likes delete own" on public.post_likes
for delete to authenticated
using (user_id = (select auth.uid()));

create policy "post comments read visible posts" on public.post_comments
for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.status = 'published'
      and (
        p.author_id = (select auth.uid())
        or exists (
          select 1 from public.profiles pr
          where pr.id = p.author_id and pr.is_private = false
        )
      )
  )
);

create policy "post comments create own" on public.post_comments
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.status = 'published'
  )
);

create policy "post comments delete own or moderator" on public.post_comments
for delete to authenticated
using (
  author_id = (select auth.uid())
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator'
);

grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_comments to authenticated;
grant select on public.post_comments to anon;

create or replace function public.bloom_post_engagement(target_post_ids uuid[])
returns table(post_id uuid, like_count bigint, comment_count bigint, liked_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         count(distinct l.user_id) as like_count,
         count(distinct c.id) filter (where c.status = 'published') as comment_count,
         coalesce(bool_or(l.user_id = (select auth.uid())), false) as liked_by_me
  from public.posts p
  left join public.post_likes l on l.post_id = p.id
  left join public.post_comments c on c.post_id = p.id
  where p.id = any(target_post_ids)
    and p.status = 'published'
    and (
      p.author_id = (select auth.uid())
      or exists (
        select 1 from public.profiles pr
        where pr.id = p.author_id and pr.is_private = false
      )
    )
  group by p.id;
$$;

revoke all on function public.bloom_post_engagement(uuid[]) from public;
grant execute on function public.bloom_post_engagement(uuid[]) to anon, authenticated;
