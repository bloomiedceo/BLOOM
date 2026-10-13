-- BLOOM media v2: support image and short video posts/stories.
-- Video uploads are capped at 25 MB; only authenticated owners can upload into their own folder.
alter table public.posts
  add column if not exists media_type text not null default 'image'
  check (media_type in ('image','video'));
alter table public.stories
  add column if not exists media_type text not null default 'image'
  check (media_type in ('image','video'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bloom-post-media','bloom-post-media',true,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public=true, file_size_limit=26214400, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bloom-story-media','bloom-story-media',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public=false, file_size_limit=26214400, allowed_mime_types=excluded.allowed_mime_types;
