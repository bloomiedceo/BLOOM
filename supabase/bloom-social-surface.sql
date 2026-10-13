-- BLOOM social surface: fast story/notification lookups and least-privilege read-state updates.
create index if not exists bloom_notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists bloom_notifications_actor_idx
  on public.notifications(actor_id) where actor_id is not null;
create index if not exists bloom_stories_active_created_idx
  on public.stories(expires_at desc, created_at desc);
create index if not exists bloom_stories_user_idx
  on public.stories(user_id, created_at desc);

revoke update on public.notifications from public, anon, authenticated;
grant update(read_at) on public.notifications to authenticated;
