-- 2D World — schema Supabase (Fase B)
-- Executar no SQL Editor do projeto Supabase

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'player' check (role in ('player', 'gm', 'admin')),
  can_access_studio boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  outfit_config jsonb not null,
  spawn_map_id text not null default 'rookgaard',
  deleted_at timestamptz,
  created_at timestamptz default now(),
  last_played_at timestamptz
);

create unique index if not exists characters_name_unique
  on public.characters (lower(name))
  where deleted_at is null;

alter table public.profiles enable row level security;
alter table public.characters enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "characters_select_own" on public.characters
  for select using (auth.uid() = account_id);

create policy "characters_insert_own" on public.characters
  for insert with check (auth.uid() = account_id);

create policy "characters_update_own" on public.characters
  for update using (auth.uid() = account_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
