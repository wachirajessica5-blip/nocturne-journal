-- Run this entire script in Supabase: SQL Editor -> New query -> Run.
-- Each signed-in user can only read, add, edit, and delete their own entries.

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  entry_date date not null default current_date,
  mood text not null default '🌙 Calm',
  body text not null check (char_length(body) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

drop policy if exists "Users can view their own journal entries" on public.journal_entries;
create policy "Users can view their own journal entries"
on public.journal_entries for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can add their own journal entries" on public.journal_entries;
create policy "Users can add their own journal entries"
on public.journal_entries for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own journal entries" on public.journal_entries;
create policy "Users can update their own journal entries"
on public.journal_entries for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own journal entries" on public.journal_entries;
create policy "Users can delete their own journal entries"
on public.journal_entries for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists journal_entries_user_date_idx
on public.journal_entries (user_id, entry_date desc);
