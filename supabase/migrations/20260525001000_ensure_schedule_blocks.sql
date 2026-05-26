create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.schedule_blocks
add column if not exists professional_id uuid,
add column if not exists block_date date,
add column if not exists start_time time,
add column if not exists end_time time,
add column if not exists reason text,
add column if not exists created_by uuid,
add column if not exists created_at timestamptz not null default now();

create index if not exists schedule_blocks_block_date_idx
on public.schedule_blocks (block_date);

create index if not exists schedule_blocks_professional_date_idx
on public.schedule_blocks (professional_id, block_date);
