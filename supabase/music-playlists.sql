-- BLOOM MUSIC shared public Spotify playlist directory.
-- Only playlist IDs and display names are stored; Spotify remains the media provider.
create table if not exists public.music_playlists (
  id uuid primary key default gen_random_uuid(),
  spotify_playlist_id text not null unique check (spotify_playlist_id ~ '^[A-Za-z0-9]{10,64}$'),
  title text not null check (char_length(title) between 2 and 60),
  added_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists bloom_music_playlists_created_idx on public.music_playlists(created_at desc);
create index if not exists bloom_music_playlists_added_by_idx on public.music_playlists(added_by);
alter table public.music_playlists enable row level security;
drop policy if exists "BLOOM playlists are publicly readable" on public.music_playlists;
create policy "BLOOM playlists are publicly readable" on public.music_playlists for select to anon, authenticated using (true);
drop policy if exists "Signed-in fans can share playlists" on public.music_playlists;
create policy "Signed-in fans can share playlists" on public.music_playlists for insert to authenticated with check (added_by = (select auth.uid()));
drop policy if exists "Fans can remove their own shared playlists" on public.music_playlists;
create policy "Fans can remove their own shared playlists" on public.music_playlists for delete to authenticated using (added_by = (select auth.uid()));
revoke all on public.music_playlists from public;
grant select on public.music_playlists to anon, authenticated;
grant insert, delete on public.music_playlists to authenticated;
