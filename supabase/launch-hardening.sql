-- BLOOM launch hardening migration.
-- Safe to re-run: only replaces policy expressions, adds missing indexes, and tightens
-- direct EXECUTE grants on trigger/event-trigger functions.
-- bloom_post_engagement remains callable because the public feed uses it for aggregate counts.

revoke all on function public.bloom_create_profile() from public, anon, authenticated;
revoke all on function public.bloom_add_group_owner() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

alter policy "posts update own or moderator" on public.posts
  using (author_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator')
  with check (author_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');
alter policy "posts delete own or moderator" on public.posts
  using (author_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');
alter policy "groups update owner or moderator" on public.groups
  using (owner_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator')
  with check (owner_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');
alter policy "members leave or owner removes" on public.group_members
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = public.group_members.group_id and g.owner_id = (select auth.uid()))
    or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator'
  );
alter policy "messages delete own or moderator" on public.messages
  using (author_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');
alter policy "reports read own or moderator" on public.reports
  using (reporter_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');
alter policy "reports update moderator" on public.reports
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');
alter policy "post comments delete own or moderator" on public.post_comments
  using (author_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'moderator');

create index if not exists bloom_groups_owner_idx on public.groups(owner_id);
create index if not exists bloom_messages_author_idx on public.messages(author_id);
create index if not exists bloom_post_comments_author_idx on public.post_comments(author_id);
create index if not exists bloom_post_likes_user_idx on public.post_likes(user_id);
create index if not exists bloom_posts_author_idx on public.posts(author_id);
create index if not exists bloom_reports_reporter_idx on public.reports(reporter_id);
create index if not exists bloom_reports_reviewed_by_idx on public.reports(reviewed_by);
