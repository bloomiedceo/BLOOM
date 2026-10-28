-- BLOOM Feedback Booth
-- This table accepts feedback without making the inbox public.
create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('idea','bug','complaint','other')),
  subject text not null check (char_length(subject) between 3 and 100),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'new' check (status in ('new','reviewing','resolved','closed')),
  created_at timestamptz not null default now()
);

create index if not exists bloom_feedback_status_created_idx
  on public.feedback_submissions(status, created_at desc);

create index if not exists bloom_feedback_author_idx
  on public.feedback_submissions(author_id);

alter table public.feedback_submissions enable row level security;
revoke all on table public.feedback_submissions from public, anon, authenticated;
grant insert on table public.feedback_submissions to anon;
grant insert, select on table public.feedback_submissions to authenticated;
grant update(status) on table public.feedback_submissions to authenticated;

drop policy if exists "feedback anonymous submit" on public.feedback_submissions;
create policy "feedback anonymous submit"
on public.feedback_submissions for insert to anon
with check (author_id is null and status = 'new');

drop policy if exists "feedback signed-in submit" on public.feedback_submissions;
create policy "feedback signed-in submit"
on public.feedback_submissions for insert to authenticated
with check ((author_id is null or author_id = (select auth.uid())) and status = 'new');

drop policy if exists "feedback own or founder read" on public.feedback_submissions;
create policy "feedback own or founder read"
on public.feedback_submissions for select to authenticated
using (
  author_id = (select auth.uid())
  or ((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('founder','moderator')
);

drop policy if exists "feedback founder update" on public.feedback_submissions;
create policy "feedback founder update"
on public.feedback_submissions for update to authenticated
using (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('founder','moderator'))
with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') in ('founder','moderator'));
