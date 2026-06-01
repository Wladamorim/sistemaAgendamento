-- Create appointment_items table for supporting multiple services per appointment
create table if not exists public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id),
  professional_id uuid references public.professionals(id),
  duration_minutes integer not null check (duration_minutes > 0),
  price_at_booking numeric(10,2) not null check (price_at_booking >= 0),
  payment_method text,
  payment_installments integer,
  payment_details jsonb,
  paid_amount numeric(10,2),
  combo_usage_id uuid references public.combo_usages(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_payment_method check (
    payment_method is null or
    payment_method in (
      'dinheiro',
      'pix',
      'cartao_debito',
      'cartao_credito',
      'transferencia',
      'cortesia',
      'combo',
      'outro'
    )
  )
);

-- Create indexes for better query performance
create index if not exists appointment_items_appointment_id_idx on public.appointment_items (appointment_id);
create index if not exists appointment_items_procedure_id_idx on public.appointment_items (procedure_id);
create index if not exists appointment_items_professional_id_idx on public.appointment_items (professional_id);
create index if not exists appointment_items_combo_usage_id_idx on public.appointment_items (combo_usage_id);
