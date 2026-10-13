-- BLOOM social media, stories, image uploads, and in-app activity notifications.
-- Apply once to the connected Supabase project. Public media is intentionally limited to
-- resized images for public posts/stories; uploads are restricted to each user's own folder.
alter table public.posts add column if not exists media_url text;
alter table public.posts add column if not exists media_type text not null default 'image' check (media_type in ('image','video'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bloom-post-media','bloom-post-media',true,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public=true, file_size_limit=26214400, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bloom-story-media','bloom-story-media',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public=false, file_size_limit=26214400, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "BLOOM media public read" on storage.objects;
create policy "BLOOM media public read" on storage.objects for select to anon, authenticated using (bucket_id = 'bloom-post-media');
drop policy if exists "BLOOM users upload own media" on storage.objects;
create policy "BLOOM users upload own media" on storage.objects for insert to authenticated with check (bucket_id = 'bloom-post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "BLOOM users update own media" on storage.objects;
create policy "BLOOM users update own media" on storage.objects for update to authenticated using (bucket_id = 'bloom-post-media' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'bloom-post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "BLOOM users delete own media" on storage.objects;
create policy "BLOOM users delete own media" on storage.objects for delete to authenticated using (bucket_id = 'bloom-post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);



create table if not exists public.stories (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 caption text not null default '' check (char_length(caption) <= 240),
 media_url text,
 media_path text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '24 hours')
);
alter table public.stories add column if not exists media_path text;
alter table public.stories add column if not exists media_type text not null default 'image' check (media_type in ('image','video'));
alter table public.stories alter column media_url drop not null;
create index if not exists bloom_stories_expiry_idx on public.stories(expires_at desc);
alter table public.stories enable row level security;
drop policy if exists "BLOOM stories visible while active" on public.stories;
create policy "BLOOM stories visible while active" on public.stories for select to anon, authenticated using (expires_at > now() and exists (select 1 from public.profiles p where p.id = user_id and (p.is_private = false or p.id = (select auth.uid()))));
drop policy if exists "BLOOM users create own stories" on public.stories;
create policy "BLOOM users create own stories" on public.stories for insert to authenticated with check (user_id = (select auth.uid()) and media_path is not null and (storage.foldername(media_path))[1] = (select auth.uid())::text and expires_at <= now() + interval '24 hours 5 minutes' and expires_at > now());
drop policy if exists "BLOOM users delete own stories" on public.stories;
create policy "BLOOM users delete own stories" on public.stories for delete to authenticated using (user_id = (select auth.uid()));
grant select on public.stories to anon, authenticated;
grant insert, delete on public.stories to authenticated;

drop policy if exists "BLOOM story media visible while active" on storage.objects;
create policy "BLOOM story media visible while active" on storage.objects for select to anon, authenticated
using (bucket_id = 'bloom-story-media' and exists (select 1 from public.stories s where s.media_path = name and s.expires_at > now()));
drop policy if exists "BLOOM users upload own story media" on storage.objects;
create policy "BLOOM users upload own story media" on storage.objects for insert to authenticated
with check (bucket_id = 'bloom-story-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "BLOOM users delete own story media" on storage.objects;
create policy "BLOOM users delete own story media" on storage.objects for delete to authenticated
using (bucket_id = 'bloom-story-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null,
 kind text not null check (kind in ('like','comment','group_message')),
 entity_id uuid,
 body text not null check (char_length(body) between 1 and 240),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists bloom_notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "BLOOM users read own notifications" on public.notifications;
create policy "BLOOM users read own notifications" on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
drop policy if exists "BLOOM users mark own notifications read" on public.notifications;
create policy "BLOOM users mark own notifications read" on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
grant select on public.notifications to authenticated;
revoke update on public.notifications from public, anon, authenticated;
grant update(read_at) on public.notifications to authenticated;

create or replace function public.bloom_notify_post_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.notifications(recipient_id, actor_id, kind, entity_id, body)
 select p.author_id, new.user_id, 'like', new.post_id, 'Someone liked your post.'
 from public.posts p where p.id = new.post_id and p.author_id <> new.user_id;
 return new;
end;
$$;
create or replace function public.bloom_notify_post_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.notifications(recipient_id, actor_id, kind, entity_id, body)
 select p.author_id, new.author_id, 'comment', new.post_id, 'Someone commented on your post.'
 from public.posts p where p.id = new.post_id and p.author_id <> new.author_id and new.status = 'published';
 return new;
end;
$$;
create or replace function public.bloom_notify_group_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.notifications(recipient_id, actor_id, kind, entity_id, body)
 select gm.user_id, new.author_id, 'group_message', new.group_id, 'New message in a group you joined.'
 from public.group_members gm where gm.group_id = new.group_id and gm.user_id <> new.author_id;
 return new;
end;
$$;
revoke all on function public.bloom_notify_post_like() from public, anon, authenticated;
revoke all on function public.bloom_notify_post_comment() from public, anon, authenticated;
revoke all on function public.bloom_notify_group_message() from public, anon, authenticated;
drop trigger if exists bloom_notify_post_like_trigger on public.post_likes;
create trigger bloom_notify_post_like_trigger after insert on public.post_likes for each row execute function public.bloom_notify_post_like();
drop trigger if exists bloom_notify_post_comment_trigger on public.post_comments;
create trigger bloom_notify_post_comment_trigger after insert on public.post_comments for each row execute function public.bloom_notify_post_comment();
drop trigger if exists bloom_notify_group_message_trigger on public.messages;
create trigger bloom_notify_group_message_trigger after insert on public.messages for each row execute function public.bloom_notify_group_message();
