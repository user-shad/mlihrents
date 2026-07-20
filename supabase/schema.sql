-- MLIHrents shared cloud store (run in Supabase SQL editor)
create table if not exists public.portal_sync (
  id text primary key,
  accounts jsonb not null default '[]'::jsonb,
  ops jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.portal_sync (id, accounts, ops)
values ('main', '[]'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.portal_sync enable row level security;

drop policy if exists "portal_sync_public_rw" on public.portal_sync;
create policy "portal_sync_public_rw"
  on public.portal_sync
  for all
  using (true)
  with check (true);

-- Enable Realtime: Supabase Dashboard → Database → Replication → portal_sync → ON
