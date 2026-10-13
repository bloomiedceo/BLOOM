-- Least-privilege update access for BLOOM marketplace purchase requests.
-- Sellers can close a request, but cannot rewrite the buyer, message, or listing.
revoke update on public.marketplace_inquiries from public, anon, authenticated;
grant update(status) on public.marketplace_inquiries to authenticated;
