-- BLOOM in-app marketplace: listings and buyer requests.
-- No payment credentials or payment processing are stored in these tables.
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 90),
  description text not null check (char_length(description) between 1 and 1200),
  category text not null check (category in ('albums','photocards','fashion','accessories','concert','other')),
  item_condition text not null default 'good' check (item_condition in ('new','like_new','good','fair')),
  price numeric(10,2) not null default 0 check (price >= 0 and price <= 100000),
  currency text not null default 'MYR' check (currency = 'MYR'),
  emoji text not null default '🌸' check (char_length(emoji) between 1 and 8),
  status text not null default 'active' check (status in ('active','reserved','sold','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bloom_marketplace_active_created_idx
  on public.marketplace_listings(status, created_at desc);
create index if not exists bloom_marketplace_seller_idx
  on public.marketplace_listings(seller_id, created_at desc);

create table if not exists public.marketplace_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 600),
  status text not null default 'new' check (status in ('new','closed')),
  created_at timestamptz not null default now(),
  constraint marketplace_inquiries_not_self check (buyer_id is not null)
);

create index if not exists bloom_marketplace_inquiries_listing_idx
  on public.marketplace_inquiries(listing_id, created_at desc);
create index if not exists bloom_marketplace_inquiries_buyer_idx
  on public.marketplace_inquiries(buyer_id, created_at desc);

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_inquiries enable row level security;

drop policy if exists "marketplace listings visible when active or owned" on public.marketplace_listings;
create policy "marketplace listings visible when active or owned"
  on public.marketplace_listings for select to anon, authenticated
  using (status = 'active' or seller_id = (select auth.uid()));

drop policy if exists "marketplace sellers create own listings" on public.marketplace_listings;
create policy "marketplace sellers create own listings"
  on public.marketplace_listings for insert to authenticated
  with check (seller_id = (select auth.uid()));

drop policy if exists "marketplace sellers update own listings" on public.marketplace_listings;
create policy "marketplace sellers update own listings"
  on public.marketplace_listings for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

drop policy if exists "marketplace sellers delete own listings" on public.marketplace_listings;
create policy "marketplace sellers delete own listings"
  on public.marketplace_listings for delete to authenticated
  using (seller_id = (select auth.uid()));

drop policy if exists "marketplace inquiry buyer or seller can read" on public.marketplace_inquiries;
create policy "marketplace inquiry buyer or seller can read"
  on public.marketplace_inquiries for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.marketplace_listings l
      where l.id = listing_id and l.seller_id = (select auth.uid())
    )
  );

drop policy if exists "marketplace buyers send request to active listing" on public.marketplace_inquiries;
create policy "marketplace buyers send request to active listing"
  on public.marketplace_inquiries for insert to authenticated
  with check (
    buyer_id = (select auth.uid())
    and exists (
      select 1 from public.marketplace_listings l
      where l.id = listing_id
        and l.status = 'active'
        and l.seller_id <> (select auth.uid())
    )
  );

drop policy if exists "marketplace sellers close own inquiries" on public.marketplace_inquiries;
create policy "marketplace sellers close own inquiries"
  on public.marketplace_inquiries for update to authenticated
  using (
    exists (
      select 1 from public.marketplace_listings l
      where l.id = listing_id and l.seller_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.marketplace_listings l
      where l.id = listing_id and l.seller_id = (select auth.uid())
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.marketplace_listings to anon, authenticated;
grant insert, update, delete on public.marketplace_listings to authenticated;
grant select, insert, update on public.marketplace_inquiries to authenticated;
