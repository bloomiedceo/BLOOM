-- BLOOM account-level interest preferences for My Mix.
-- Run after supabase/schema.sql on an existing project. This is additive and safe
-- to re-run; it preserves all existing profiles and does not expose a new table.

alter table public.profiles
  add column if not exists interests text[] not null default '{}'::text[];

do $profile_interests$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_interests_valid_check'
  ) then
    alter table public.profiles
      add constraint profiles_interests_valid_check check (
        cardinality(interests) <= 9
        and array_position(interests, null::text) is null
        and interests <@ array['creative','gaming','lifestyle','food','outdoors','music','fandom','books','tech']::text[]
      );
  end if;
end;
$profile_interests$;
