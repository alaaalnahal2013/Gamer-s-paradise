-- ============================================================
-- GAMER'S PARADISE • SUPABASE DATABASE SCHEMA
-- Paste this script into Supabase SQL Editor and click RUN
-- ============================================================

-- 1. Create gamer_profiles table
create table if not exists public.gamer_profiles (
  id uuid default gen_random_uuid() primary key,
  gamer_tag text not null unique,
  public_ip text,
  city text,
  country text,
  best_node text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create game_sensitivities table for cloud muscle-memory sync
create table if not exists public.game_sensitivities (
  id uuid default gen_random_uuid() primary key,
  gamer_tag text not null references public.gamer_profiles(gamer_tag) on delete cascade,
  game_name text not null,
  dpi integer not null,
  sens numeric not null,
  cm_per_360 numeric not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (gamer_tag, game_name)
);

-- 3. Enable Row Level Security (RLS)
alter table public.gamer_profiles enable row level security;
alter table public.game_sensitivities enable row level security;

-- 4. Public access policies for desktop app telemetry
create policy "Allow public read access to profiles" 
  on public.gamer_profiles for select using (true);

create policy "Allow public insert/update to profiles" 
  on public.gamer_profiles for all using (true) with check (true);

create policy "Allow public read access to sensitivities" 
  on public.game_sensitivities for select using (true);

create policy "Allow public insert/update to sensitivities" 
  on public.game_sensitivities for all using (true) with check (true);
