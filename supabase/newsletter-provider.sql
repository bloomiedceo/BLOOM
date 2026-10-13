-- BLOOM newsletter provider integration.
-- Email addresses and token hashes are server-managed only. Public visitors must
-- use the newsletter-subscribe Edge Function; never grant browser table access.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  consent_at timestamptz not null default now(),
  source text not null default 'website' check (source = 'website'),
  confirmation_token_hash text,
  unsubscribe_token_hash text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_confirmation_token_unique
  on public.newsletter_subscribers(confirmation_token_hash)
  where confirmation_token_hash is not null;
create unique index if not exists newsletter_subscribers_unsubscribe_token_unique
  on public.newsletter_subscribers(unsubscribe_token_hash)
  where unsubscribe_token_hash is not null;
create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers(confirmed_at)
  where confirmed_at is not null and unsubscribed_at is null;

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from public, anon, authenticated;
-- No public policies are intentionally created. Only the server-side Edge Function
-- using SUPABASE_SERVICE_ROLE_KEY can access subscriber records.

-- Edge Functions use the server-only service_role; public roles receive no table access.
grant select, insert, update, delete on public.newsletter_subscribers to service_role;
