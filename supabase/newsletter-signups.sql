-- BLOOM newsletter signups.
-- Run after supabase/schema.sql. This stores opt-ins only; it does not send email.
create table if not exists public.newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  consent_at timestamptz not null default now(),
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create unique index if not exists newsletter_signups_email_lower_unique
  on public.newsletter_signups (lower(email));

alter table public.newsletter_signups enable row level security;

revoke all on public.newsletter_signups from anon, authenticated;
grant insert on public.newsletter_signups to anon, authenticated;

drop policy if exists "Visitors may submit newsletter opt-ins" on public.newsletter_signups;
create policy "Visitors may submit newsletter opt-ins"
  on public.newsletter_signups
  for insert
  to anon, authenticated
  with check (
    email = lower(btrim(email))
    and length(email) between 3 and 254
    and position('@' in email) > 1
    and source = 'website'
    and consent_at <= now()
    and consent_at >= now() - interval '10 minutes'
  );

-- No public SELECT, UPDATE, or DELETE policy is created.
-- Only trusted project admins/server-side code should read or manage this table.
