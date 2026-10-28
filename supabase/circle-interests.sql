-- BLOOM circle interests
-- Safe to run on existing installs; keeps current circles and defaults old rows to "other".
alter table public.groups
  add column if not exists interest text not null default 'other';

do $circle_interest$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groups'::regclass
      and conname = 'groups_interest_valid_check'
  ) then
    alter table public.groups
      add constraint groups_interest_valid_check
      check (interest in ('creative','gaming','lifestyle','food','outdoors','music','fandom','books','tech','other'));
  end if;
end;
$circle_interest$;

create index if not exists bloom_groups_interest_created_idx
  on public.groups(interest, created_at desc);
