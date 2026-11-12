-- BLOOM Universal Social Platform
-- Additive migration for the existing BLOOM Supabase project.
-- Keeps legacy columns/tables during transition; does not delete existing user content.
-- Public media is intentionally URL-public. Do not upload private/sensitive images to bloom-media.

begin;

-- 1) Universal interests and profile fields.
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists sunlight_count integer not null default 0;

alter table public.profiles drop constraint if exists profiles_interests_valid_check;
update public.profiles
set interests = coalesce((
  select array_agg(distinct mapped order by mapped)
  from (
    select case value
      when 'creative' then 'art'
      when 'lifestyle' then 'life'
      when 'fandom' then null
      else value
    end as mapped
    from unnest(coalesce(interests, '{}'::text[])) as value
  ) normalized
  where mapped in ('art','gaming','life','food','outdoors','music','books','tech')
), '{}'::text[]);
alter table public.profiles
  add constraint profiles_interests_valid_check check (
    cardinality(interests) <= 8
    and array_position(interests, null::text) is null
    and interests <@ array['art','gaming','life','food','outdoors','music','books','tech']::text[]
  );

-- 2) Keep the existing posts table and add the universal Plants contract.
alter table public.posts
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists image_url text,
  add column if not exists filter_applied text not null default 'original',
  add column if not exists caption text,
  add column if not exists category text,
  add column if not exists sunlight_count integer not null default 0,
  add column if not exists likes_count integer not null default 0;

update public.posts
set user_id = coalesce(user_id, author_id),
    image_url = coalesce(image_url, media_url),
    caption = coalesce(caption, nullif(body, ''), title, ''),
    category = coalesce(category,
      case lower(coalesce(fandom, ''))
        when 'creative' then 'art'
        when 'art & design' then 'art'
        when 'gaming' then 'gaming'
        when 'lifestyle' then 'life'
        when 'food' then 'food'
        when 'outdoors' then 'outdoors'
        when 'music' then 'music'
        when 'books' then 'books'
        when 'tech' then 'tech'
        else 'life'
      end)
where user_id is null or caption is null or category is null or image_url is null;

update public.posts set caption = '' where caption is null;
update public.posts set category = 'life' where category is null;
update public.posts set user_id = author_id where user_id is null;
alter table public.posts alter column user_id set not null;
alter table public.posts alter column caption set default '';
alter table public.posts alter column caption set not null;
alter table public.posts alter column category set default 'life';
alter table public.posts alter column category set not null;
alter table public.posts drop constraint if exists posts_category_universal_check;
alter table public.posts add constraint posts_category_universal_check
  check (category in ('art','gaming','life','food','outdoors','music','books','tech'));
create index if not exists bloom_posts_user_created_idx on public.posts(user_id, created_at desc);
create index if not exists bloom_posts_category_created_idx on public.posts(category, created_at desc);

-- 3) Universal comment aliases, preserving older author_id/body consumers.
alter table public.post_comments
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists content text;

update public.post_comments
set user_id = coalesce(user_id, author_id),
    content = coalesce(content, body, '')
where user_id is null or content is null;
alter table public.post_comments alter column user_id set not null;
alter table public.post_comments alter column content set not null;
create index if not exists bloom_comments_post_created_idx on public.post_comments(post_id, created_at desc);

-- 4) Public circles and private direct-message circles.
create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 90),
  category text not null default 'life' check (category in ('art','gaming','life','food','outdoors','music','books','tech','general')),
  description text not null default '' check (char_length(description) <= 500),
  is_dm boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  dm_pair_key text unique,
  created_at timestamptz not null default now(),
  constraint circles_dm_pair_shape_check check (
    (is_dm = false and dm_pair_key is null) or (is_dm = true and dm_pair_key is not null)
  )
);
create unique index if not exists bloom_public_circle_name_category_uq
  on public.circles(lower(name), category) where is_dm = false;
create index if not exists bloom_circles_public_category_created_idx
  on public.circles(category, created_at desc) where is_dm = false;

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index if not exists bloom_circle_members_user_idx on public.circle_members(user_id, circle_id);

-- Migrate old public groups into circles using the same IDs so old message history is retained.
insert into public.circles(id, name, category, description, is_dm, created_by, created_at)
select g.id, g.name, 'general', 'Migrated from an earlier BLOOM community.', false, g.owner_id, g.created_at
from public.groups g
where not exists (
  select 1 from public.circles c where c.id = g.id
     or (c.is_dm = false and lower(c.name) = lower(g.name) and c.category = 'general')
)
on conflict do nothing;

insert into public.circle_members(circle_id, user_id, role, created_at)
select gm.group_id, gm.user_id, gm.role, coalesce(gm.joined_at, now())
from public.group_members gm
join public.circles c on c.id = gm.group_id
on conflict (circle_id, user_id) do nothing;

-- Starter public Interest Circles. These are safe to re-run.
insert into public.circles(name, category, description, is_dm)
select seed.name, seed.category, seed.description, false
from (values
  ('Gamer''s Lounge','gaming','Find teammates, share cosy setups, and talk about the games you love.'),
  ('Book Club','books','Reading notes, recommendations, and spoiler-friendly book chats.'),
  ('Foodie Finds','food','Recipes, cafe discoveries, and small kitchen victories.'),
  ('Art & Design','art','Illustration, design, photography, crafts, and works in progress.')
) as seed(name, category, description)
where not exists (
  select 1 from public.circles c
  where c.is_dm = false and lower(c.name) = lower(seed.name) and c.category = seed.category
);

-- 5) Extend the existing messages table without throwing away old Greenhouse messages.
alter table public.messages
  add column if not exists circle_id uuid references public.circles(id) on delete cascade,
  add column if not exists sender_id uuid references public.profiles(id) on delete cascade,
  add column if not exists message_type text not null default 'text',
  add column if not exists content text,
  add column if not exists shared_post_id uuid references public.posts(id) on delete set null;

update public.messages
set circle_id = coalesce(circle_id, group_id),
    sender_id = coalesce(sender_id, author_id),
    content = coalesce(content, body)
where circle_id is null or sender_id is null or content is null;
alter table public.messages alter column group_id drop not null;
alter table public.messages alter column circle_id set not null;
alter table public.messages alter column sender_id set not null;
alter table public.messages alter column content set not null;
alter table public.messages drop constraint if exists messages_type_universal_check;
alter table public.messages add constraint messages_type_universal_check
  check (message_type in ('text','image','post_share'));
alter table public.messages drop constraint if exists messages_shared_post_type_check;
alter table public.messages add constraint messages_shared_post_type_check
  check ((message_type = 'post_share' and shared_post_id is not null) or message_type <> 'post_share');
create index if not exists bloom_messages_circle_created_idx on public.messages(circle_id, created_at desc);
create index if not exists bloom_messages_shared_post_idx on public.messages(shared_post_id) where shared_post_id is not null;

-- 6) Reactions, blocks, followers, feedback, and demo seeds.
create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('sunlight','heart')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction_type)
);
create index if not exists bloom_post_reactions_user_idx on public.post_reactions(user_id, post_id);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_users_not_self_check check (blocker_id <> blocked_id),
  constraint blocked_users_unique_pair unique (blocker_id, blocked_id)
);
create index if not exists bloom_blocked_users_blocked_idx on public.blocked_users(blocked_id, blocker_id);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, user_id),
  constraint bloom_follows_not_self_check check (follower_id <> user_id)
);
create index if not exists bloom_follows_user_idx on public.follows(user_id, created_at desc);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('idea','bug','complaint','other')),
  message text not null check (char_length(message) between 10 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists bloom_feedback_user_created_idx on public.feedback(user_id, created_at desc);

create table if not exists public.sample_plants (
  id text primary key,
  creator_name text not null,
  category text not null check (category in ('art','gaming','life','food','outdoors','music','books','tech')),
  caption text not null,
  emoji text not null,
  art_key text not null check (art_key in ('flower','gaming','life','food','outdoors')),
  created_at timestamptz not null default now()
);
insert into public.sample_plants(id, creator_name, category, caption, emoji, art_key) values
  ('seed-art-01','thepaperfern','art','A tiny desk corner for sketches, colour studies, and unfinished ideas.','🎨','flower'),
  ('seed-game-01','pixelmoss','gaming','A cosy little setup for one more round with friends.','🎮','gaming'),
  ('seed-life-01','littlefern','life','A slower morning, fresh flowers, and a notebook with no plan.','🌱','life'),
  ('seed-food-01','misoandmint','food','Comfort in a bowl: noodles, herbs, and a little chilli crisp.','🍜','food'),
  ('seed-outdoor-01','outsideoften','outdoors','Took the longer way home. The sky did the rest.','🌿','outdoors')
on conflict (id) do update set
  creator_name = excluded.creator_name,
  category = excluded.category,
  caption = excluded.caption,
  emoji = excluded.emoji,
  art_key = excluded.art_key;

-- 7) Add universal notification fields to the existing notifications table.
alter table public.notifications
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists type text,
  add column if not exists post_id uuid references public.posts(id) on delete cascade,
  add column if not exists is_read boolean not null default false;

update public.notifications
set user_id = coalesce(user_id, recipient_id),
    type = coalesce(type, case when kind = 'comment' then 'comment' when kind = 'like' then 'like' else 'share' end),
    post_id = coalesce(post_id, case when kind in ('like','comment') then entity_id else null end),
    is_read = coalesce(is_read, read_at is not null)
where user_id is null or type is null or (post_id is null and kind in ('like','comment'));

update public.notifications set type = 'share' where type not in ('like','sunlight','comment','share');
update public.notifications set is_read = (read_at is not null) where read_at is not null;
alter table public.notifications alter column user_id set not null;
alter table public.notifications alter column type set default 'like';
alter table public.notifications alter column type set not null;
alter table public.notifications drop constraint if exists notifications_type_universal_check;
alter table public.notifications add constraint notifications_type_universal_check
  check (type in ('like','sunlight','comment','share'));
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like','sunlight','comment','share','group_message'));
create index if not exists bloom_notifications_user_created_idx on public.notifications(user_id, created_at desc);

-- 8) Create the requested public media bucket. Upload/write operations remain owner-folder restricted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bloom-media','bloom-media',true,15728640,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 15728640,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "BLOOM upload own media" on storage.objects;
create policy "BLOOM upload own media" on storage.objects
for insert to authenticated
with check (bucket_id = 'bloom-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "BLOOM update own media" on storage.objects;
create policy "BLOOM update own media" on storage.objects
for update to authenticated
using (bucket_id = 'bloom-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'bloom-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "BLOOM delete own media" on storage.objects;
create policy "BLOOM delete own media" on storage.objects
for delete to authenticated
using (bucket_id = 'bloom-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- SECURITY DEFINER membership helpers avoid recursive RLS on circle_members.
create or replace function public.bloom_is_circle_member(target_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1 from public.circle_members cm
    where cm.circle_id = target_circle_id
      and cm.user_id = (select auth.uid())
  );
$;
revoke all on function public.bloom_is_circle_member(uuid) from public, anon;
grant execute on function public.bloom_is_circle_member(uuid) to anon, authenticated;

create or replace function public.bloom_is_blocked(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = target_user_id)
         or (b.blocker_id = target_user_id and b.blocked_id = (select auth.uid()))
    );
$;
revoke all on function public.bloom_is_blocked(uuid) from public;
grant execute on function public.bloom_is_blocked(uuid) to anon, authenticated;

-- DM creation is a validated RPC: callers can only create a DM with themselves and
-- a discoverable, non-blocked profile. Membership for both people is inserted atomically.
create or replace function public.bloom_create_dm(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $
declare
  caller_id uuid := auth.uid();
  pair_key text;
  circle_id uuid;
begin
  if caller_id is null then raise exception 'Sign in required'; end if;
  if target_user_id is null or target_user_id = caller_id then raise exception 'Choose another gardener'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id and p.is_private = false) then
    raise exception 'This profile is not available for direct messages';
  end if;
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = caller_id and b.blocked_id = target_user_id)
       or (b.blocker_id = target_user_id and b.blocked_id = caller_id)
  ) then raise exception 'This direct message is not available'; end if;
  pair_key := least(caller_id::text, target_user_id::text) || ':' || greatest(caller_id::text, target_user_id::text);
  insert into public.circles(name,category,description,is_dm,created_by,dm_pair_key)
  values ('Direct message','general','A private conversation.',true,caller_id,pair_key)
  on conflict (dm_pair_key) do update set dm_pair_key = excluded.dm_pair_key
  returning id into circle_id;
  insert into public.circle_members(circle_id,user_id,role)
  values (circle_id,caller_id,'owner'),(circle_id,target_user_id,'member')
  on conflict (circle_id,user_id) do nothing;
  return circle_id;
end;
$;
revoke all on function public.bloom_create_dm(uuid) from public, anon;
grant execute on function public.bloom_create_dm(uuid) to authenticated;

-- 9) Enable RLS and replace permissive legacy policies where the universal policy needs blocks/privacy.
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.messages enable row level security;
alter table public.post_reactions enable row level security;
alter table public.blocked_users enable row level security;
alter table public.follows enable row level security;
alter table public.feedback enable row level security;
alter table public.sample_plants enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles read public or own" on public.profiles;
create policy "profiles read public or own" on public.profiles
for select to anon, authenticated
using (
  (is_private = false or id = (select auth.uid()))
  and not public.bloom_is_blocked(id)
);

drop policy if exists "posts read public or own" on public.posts;
create policy "posts read public or own" on public.posts
for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.profiles p
    where p.id = posts.user_id
      and (p.is_private = false or p.id = (select auth.uid()))
  )
  and not public.bloom_is_blocked(posts.user_id)
);

drop policy if exists "posts create own" on public.posts;
create policy "posts create own" on public.posts
for insert to authenticated
with check (user_id = (select auth.uid()) and author_id = (select auth.uid()) and status = 'published');

drop policy if exists "posts update own or moderator" on public.posts;
create policy "posts update own or moderator" on public.posts
for update to authenticated
using (user_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('moderator','founder'))
with check (user_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('moderator','founder'));

drop policy if exists "posts delete own or moderator" on public.posts;
create policy "posts delete own or moderator" on public.posts
for delete to authenticated
using (user_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('moderator','founder'));

drop policy if exists "post comments read visible posts" on public.post_comments;
create policy "post comments read visible posts" on public.post_comments
for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.id = post_comments.post_id and p.status = 'published'
      and (pr.is_private = false or pr.id = (select auth.uid()))
      and not public.bloom_is_blocked(p.user_id)
  )
);
drop policy if exists "post comments create own" on public.post_comments;
create policy "post comments create own" on public.post_comments
for insert to authenticated
with check (
  user_id = (select auth.uid()) and author_id = (select auth.uid())
  and status = 'published'
  and exists (
    select 1 from public.posts p
    join public.profiles pr on pr.id = p.user_id
    where p.id = post_comments.post_id and p.status = 'published'
      and (pr.is_private = false or p.user_id = (select auth.uid()))
      and not public.bloom_is_blocked(p.user_id)
  )
);
drop policy if exists "post comments delete own or moderator" on public.post_comments;
create policy "post comments delete own or moderator" on public.post_comments
for delete to authenticated
using (user_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('moderator','founder'));

-- Public circles can be browsed by guests. DM circle metadata is visible only to its members.
drop policy if exists "circles read public or members" on public.circles;
create policy "circles read public or members" on public.circles
for select to anon, authenticated
using (
  (is_dm = false)
  or created_by = (select auth.uid())
  or public.bloom_is_circle_member(circles.id)
);
drop policy if exists "circles create own" on public.circles;
create policy "circles create own" on public.circles
for insert to authenticated
with check (created_by = (select auth.uid()) and is_dm = true and dm_pair_key is not null);
drop policy if exists "circle members read together" on public.circle_members;
create policy "circle members read together" on public.circle_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.bloom_is_circle_member(circle_members.circle_id)
);
drop policy if exists "circle members join or invite" on public.circle_members;
create policy "circle members join or invite" on public.circle_members
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.circles c
    where c.id = circle_members.circle_id and c.is_dm = false
  )
);
drop policy if exists "circle members leave own" on public.circle_members;
create policy "circle members leave own" on public.circle_members
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "messages read members" on public.messages;
create policy "messages read members" on public.messages
for select to authenticated
using (
  public.bloom_is_circle_member(messages.circle_id)
  and not public.bloom_is_blocked(messages.sender_id)
);
drop policy if exists "messages create as member" on public.messages;
create policy "messages create as member" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid()) and author_id = (select auth.uid())
  and circle_id is not null and content is not null and body = content
  and public.bloom_is_circle_member(messages.circle_id)
  and not exists (
    select 1 from public.circle_members other
    where other.circle_id = messages.circle_id and other.user_id <> (select auth.uid())
      and public.bloom_is_blocked(other.user_id)
  )
);
drop policy if exists "messages delete own or moderator" on public.messages;
create policy "messages delete own or moderator" on public.messages
for delete to authenticated
using (sender_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('moderator','founder'));

-- Reactions can only be seen/changed by the reacting user. Aggregate counts live on posts.
drop policy if exists "post reactions read own" on public.post_reactions;
create policy "post reactions read own" on public.post_reactions
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "post reactions create own" on public.post_reactions;
create policy "post reactions create own" on public.post_reactions
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published')
  and not exists (
    select 1 from public.posts p
    where p.id = post_reactions.post_id and public.bloom_is_blocked(p.user_id)
  )
);
drop policy if exists "post reactions delete own" on public.post_reactions;
create policy "post reactions delete own" on public.post_reactions
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "blocked users read own" on public.blocked_users;
create policy "blocked users read own" on public.blocked_users
for select to authenticated using (blocker_id = (select auth.uid()));
drop policy if exists "blocked users create own" on public.blocked_users;
create policy "blocked users create own" on public.blocked_users
for insert to authenticated with check (blocker_id = (select auth.uid()) and blocker_id <> blocked_id);
drop policy if exists "blocked users delete own" on public.blocked_users;
create policy "blocked users delete own" on public.blocked_users
for delete to authenticated using (blocker_id = (select auth.uid()));

drop policy if exists "follows read public" on public.follows;
create policy "follows read public" on public.follows
for select to anon, authenticated using (
  follower_id = (select auth.uid()) or user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = follows.user_id and p.is_private = false)
);
drop policy if exists "follows create own" on public.follows;
create policy "follows create own" on public.follows
for insert to authenticated with check (
  follower_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = follows.user_id and p.is_private = false)
  and not public.bloom_is_blocked(follows.user_id)
);
drop policy if exists "follows delete own" on public.follows;
create policy "follows delete own" on public.follows
for delete to authenticated using (follower_id = (select auth.uid()));

drop policy if exists "feedback public submit" on public.feedback;
create policy "feedback public submit" on public.feedback
for insert to anon, authenticated
with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "feedback own or founder read" on public.feedback;
create policy "feedback own or founder read" on public.feedback
for select to authenticated
using (user_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('founder','moderator'));

drop policy if exists "sample plants public read" on public.sample_plants;
create policy "sample plants public read" on public.sample_plants
for select to anon, authenticated using (true);

-- Notifications continue to use legacy recipient_id/read_at alongside the new user_id/is_read fields.
drop policy if exists "BLOOM users read own notifications" on public.notifications;
create policy "BLOOM users read own notifications" on public.notifications
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "BLOOM users mark own notifications read" on public.notifications;
create policy "BLOOM users mark own notifications read" on public.notifications
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 10) RLS and SQL grants.
grant select on public.profiles, public.posts, public.post_comments, public.circles, public.sample_plants to anon, authenticated;
revoke update on public.profiles from authenticated;
grant update(username, bio, avatar_url, interests, is_private) on public.profiles to authenticated;
grant insert, delete on public.posts to authenticated;
revoke update on public.posts from authenticated;
grant update(title, body, fandom, link, status, media_url, media_type, image_url, filter_applied, caption, category) on public.posts to authenticated;
grant insert, select, delete on public.post_comments to authenticated;
grant select, insert, update, delete on public.circles to authenticated;
grant select, insert, delete on public.circle_members to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, delete on public.post_reactions to authenticated;
grant select, insert, delete on public.blocked_users to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant insert, select on public.feedback to anon, authenticated;
revoke insert, update on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update(is_read, read_at) on public.notifications to authenticated;

-- 11) Trigger-maintained counters and notifications. These functions are trigger-only.
create or replace function public.bloom_sync_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid;
  v_user_id uuid;
  v_kind text;
  v_delta integer;
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    v_post_id := new.post_id; v_user_id := new.user_id; v_kind := new.reaction_type; v_delta := 1;
  else
    v_post_id := old.post_id; v_user_id := old.user_id; v_kind := old.reaction_type; v_delta := -1;
  end if;

  select p.user_id into v_owner from public.posts p where p.id = v_post_id;
  if v_kind = 'sunlight' then
    update public.posts set sunlight_count = greatest(0, sunlight_count + v_delta) where id = v_post_id;
    update public.profiles set sunlight_count = greatest(0, sunlight_count + v_delta) where id = v_owner;
  elsif v_kind = 'heart' then
    update public.posts set likes_count = greatest(0, likes_count + v_delta) where id = v_post_id;
  end if;
  if tg_op = 'INSERT' then return new; else return old; end if;
end;
$$;
revoke all on function public.bloom_sync_reaction_counts() from public, anon, authenticated;
drop trigger if exists bloom_sync_reaction_counts_insert on public.post_reactions;
create trigger bloom_sync_reaction_counts_insert after insert on public.post_reactions
for each row execute function public.bloom_sync_reaction_counts();
drop trigger if exists bloom_sync_reaction_counts_delete on public.post_reactions;
create trigger bloom_sync_reaction_counts_delete after delete on public.post_reactions
for each row execute function public.bloom_sync_reaction_counts();

create or replace function public.bloom_notify_universal_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_type text;
  v_label text;
begin
  select p.user_id into v_owner from public.posts p where p.id = new.post_id;
  v_type := case when new.reaction_type = 'sunlight' then 'sunlight' else 'like' end;
  v_label := case when new.reaction_type = 'sunlight' then 'sent you sunlight.' else 'liked your plant.' end;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications(recipient_id,user_id,actor_id,kind,type,entity_id,post_id,body,is_read,read_at)
    values (v_owner,v_owner,new.user_id,v_type,v_type,new.post_id,new.post_id,'Someone '||v_label,false,null);
  end if;
  return new;
end;
$$;
revoke all on function public.bloom_notify_universal_reaction() from public, anon, authenticated;
drop trigger if exists bloom_notify_universal_reaction_trigger on public.post_reactions;
create trigger bloom_notify_universal_reaction_trigger after insert on public.post_reactions
for each row execute function public.bloom_notify_universal_reaction();

-- Replace legacy notification functions so their writes satisfy the new required notification columns.
create or replace function public.bloom_notify_post_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  select p.author_id into v_owner from public.posts p where p.id = new.post_id;
  if v_owner is not null and v_owner <> new.user_id then
    insert into public.notifications(recipient_id,user_id,actor_id,kind,type,entity_id,post_id,body,is_read,read_at)
    values (v_owner,v_owner,new.user_id,'like','like',new.post_id,new.post_id,'Someone liked your plant.',false,null);
  end if;
  return new;
end;
$$;
create or replace function public.bloom_notify_post_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid;
begin
  select p.author_id into v_owner from public.posts p where p.id = new.post_id;
  if v_owner is not null and v_owner <> new.author_id and new.status = 'published' then
    insert into public.notifications(recipient_id,user_id,actor_id,kind,type,entity_id,post_id,body,is_read,read_at)
    values (v_owner,v_owner,new.author_id,'comment','comment',new.post_id,new.post_id,'Someone commented on your plant.',false,null);
  end if;
  return new;
end;
$$;
create or replace function public.bloom_notify_group_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.group_id is not null then
    insert into public.notifications(recipient_id,user_id,actor_id,kind,type,entity_id,post_id,body,is_read,read_at)
    select gm.user_id,gm.user_id,new.author_id,'group_message','share',new.group_id,null,'New message in a circle.',false,null
    from public.group_members gm where gm.group_id = new.group_id and gm.user_id <> new.author_id;
  end if;
  return new;
end;
$$;
revoke all on function public.bloom_notify_post_like() from public, anon, authenticated;
revoke all on function public.bloom_notify_post_comment() from public, anon, authenticated;
revoke all on function public.bloom_notify_group_message() from public, anon, authenticated;

create or replace function public.bloom_notify_circle_share()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.message_type = 'post_share' then
    insert into public.notifications(recipient_id,user_id,actor_id,kind,type,entity_id,post_id,body,is_read,read_at)
    select cm.user_id,cm.user_id,new.sender_id,'share','share',new.shared_post_id,new.shared_post_id,'A gardener shared a plant with you.',false,null
    from public.circle_members cm
    where cm.circle_id = new.circle_id and cm.user_id <> new.sender_id;
  end if;
  return new;
end;
$$;
revoke all on function public.bloom_notify_circle_share() from public, anon, authenticated;
drop trigger if exists bloom_notify_circle_share_trigger on public.messages;
create trigger bloom_notify_circle_share_trigger after insert on public.messages
for each row execute function public.bloom_notify_circle_share();

-- 12) Keep Realtime for circles/chats and live notification updates.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null;
end;
$$;

commit;
