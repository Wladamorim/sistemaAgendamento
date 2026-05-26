alter table public.appointments
add column if not exists payment_method text,
add column if not exists payment_installments integer,
add column if not exists payment_details jsonb,
add column if not exists paid_amount numeric(10,2);

create table if not exists public.combo_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  linked_type text not null check (linked_type in ('procedure', 'category')),
  procedure_id uuid references public.procedures(id),
  category_id uuid references public.procedure_categories(id),
  total_sessions integer not null check (total_sessions > 0),
  validity_days integer not null check (validity_days > 0),
  package_price numeric(10,2) not null check (package_price >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (linked_type = 'procedure' and procedure_id is not null and category_id is null)
    or
    (linked_type = 'category' and category_id is not null and procedure_id is null)
  )
);

create table if not exists public.client_combos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  combo_template_id uuid not null references public.combo_templates(id),
  name text not null,
  linked_type text not null check (linked_type in ('procedure', 'category')),
  procedure_id uuid references public.procedures(id),
  category_id uuid references public.procedure_categories(id),
  total_sessions integer not null check (total_sessions > 0),
  used_sessions integer not null default 0 check (used_sessions >= 0),
  remaining_sessions integer not null check (remaining_sessions >= 0),
  start_date date not null,
  expiration_date date not null,
  package_price numeric(10,2) not null check (package_price >= 0),
  purchase_payment_method text not null,
  purchase_payment_installments integer,
  purchase_payment_details jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'cancelled')),
  notes text,
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (used_sessions <= total_sessions),
  check (remaining_sessions <= total_sessions),
  check (remaining_sessions = total_sessions - used_sessions),
  check (expiration_date >= start_date),
  check (
    (linked_type = 'procedure' and procedure_id is not null and category_id is null)
    or
    (linked_type = 'category' and category_id is not null and procedure_id is null)
  )
);

alter table public.client_combos
add column if not exists purchase_payment_installments integer;

create table if not exists public.combo_usages (
  id uuid primary key default gen_random_uuid(),
  client_combo_id uuid not null references public.client_combos(id),
  appointment_id uuid not null references public.appointments(id),
  client_id uuid not null references public.clients(id),
  procedure_id uuid not null references public.procedures(id),
  professional_id uuid references public.professionals(id),
  sessions_used integer not null default 1 check (sessions_used > 0),
  production_value numeric(10,2),
  used_at timestamptz not null default now(),
  used_by uuid,
  notes text,
  unique (client_combo_id, appointment_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.combo_usages'::regclass
      and conname = 'combo_usages_appointment_id_unique'
  ) then
    alter table public.combo_usages
    add constraint combo_usages_appointment_id_unique unique (appointment_id);
  end if;
end;
$$;

create index if not exists combo_templates_active_idx on public.combo_templates (is_active);
create index if not exists combo_templates_linked_idx on public.combo_templates (linked_type, procedure_id, category_id);
create index if not exists client_combos_client_status_idx on public.client_combos (client_id, status);
create index if not exists client_combos_expiration_idx on public.client_combos (expiration_date);
create index if not exists combo_usages_client_combo_idx on public.combo_usages (client_combo_id);
create index if not exists combo_usages_appointment_idx on public.combo_usages (appointment_id);
create index if not exists combo_usages_used_at_idx on public.combo_usages (used_at);

create or replace view public.v_client_combos_full as
select
  cc.id,
  cc.client_id,
  c.full_name as client_name,
  c.phone as client_phone,
  cc.combo_template_id,
  cc.name,
  cc.linked_type,
  cc.procedure_id,
  p.name as procedure_name,
  cc.category_id,
  pc.name as category_name,
  cc.total_sessions,
  cc.used_sessions,
  cc.remaining_sessions,
  cc.start_date,
  cc.expiration_date,
  cc.package_price,
  cc.purchase_payment_method,
  cc.purchase_payment_installments,
  cc.purchase_payment_details,
  case
    when cc.status = 'cancelled' then 'cancelled'
    when cc.status = 'completed' or cc.remaining_sessions <= 0 then 'completed'
    when cc.status = 'expired' or cc.expiration_date < current_date then 'expired'
    else cc.status
  end as effective_status,
  cc.status,
  cc.notes,
  cc.cancellation_reason,
  cc.cancelled_at,
  cancelled_by_user.name as cancelled_by_name,
  created_by_user.name as created_by_name,
  updated_by_user.name as updated_by_name,
  cc.created_at,
  cc.updated_at
from public.client_combos cc
join public.clients c on c.id = cc.client_id
left join public.procedures p on p.id = cc.procedure_id
left join public.procedure_categories pc on pc.id = cc.category_id
left join public.users cancelled_by_user on cancelled_by_user.id = cc.cancelled_by
left join public.users created_by_user on created_by_user.id = cc.created_by
left join public.users updated_by_user on updated_by_user.id = cc.updated_by;

create or replace view public.v_combo_usages_full as
select
  cu.id,
  cu.client_combo_id,
  cc.name as combo_name,
  cu.appointment_id,
  cu.client_id,
  c.full_name as client_name,
  cu.procedure_id,
  p.name as procedure_name,
  p.category_id,
  pc.name as category_name,
  cu.professional_id,
  pr.name as professional_name,
  cu.sessions_used,
  cu.production_value,
  cu.used_at,
  cu.used_by,
  used_by_user.name as used_by_name,
  cu.notes
from public.combo_usages cu
join public.client_combos cc on cc.id = cu.client_combo_id
join public.clients c on c.id = cu.client_id
join public.procedures p on p.id = cu.procedure_id
left join public.procedure_categories pc on pc.id = p.category_id
left join public.professionals pr on pr.id = cu.professional_id
left join public.users used_by_user on used_by_user.id = cu.used_by;

create or replace function public.create_client_combo_from_template(
  p_client_id uuid,
  p_combo_template_id uuid,
  p_start_date date,
  p_purchase_payment_method text,
  p_purchase_payment_installments integer default null,
  p_purchase_payment_details jsonb default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.combo_templates%rowtype;
  v_client_combo_id uuid;
  v_expiration_date date;
begin
  if p_client_id is null then
    raise exception 'Cliente nao informado.';
  end if;

  if p_combo_template_id is null then
    raise exception 'Modelo de combo nao informado.';
  end if;

  if p_start_date is null then
    raise exception 'Data de inicio nao informada.';
  end if;

  if nullif(trim(p_purchase_payment_method), '') is null then
    raise exception 'Forma de pagamento nao informada.';
  end if;

  perform 1
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  select *
    into v_template
  from public.combo_templates
  where id = p_combo_template_id
    and is_active = true;

  if not found then
    raise exception 'Modelo de combo nao encontrado ou inativo.';
  end if;

  v_expiration_date := p_start_date + v_template.validity_days;

  insert into public.client_combos (
    client_id,
    combo_template_id,
    name,
    linked_type,
    procedure_id,
    category_id,
    total_sessions,
    used_sessions,
    remaining_sessions,
    start_date,
    expiration_date,
    package_price,
    purchase_payment_method,
    purchase_payment_installments,
    purchase_payment_details,
    status,
    notes,
    created_by,
    updated_by
  )
  values (
    p_client_id,
    v_template.id,
    v_template.name,
    v_template.linked_type,
    v_template.procedure_id,
    v_template.category_id,
    v_template.total_sessions,
    0,
    v_template.total_sessions,
    p_start_date,
    v_expiration_date,
    v_template.package_price,
    p_purchase_payment_method,
    p_purchase_payment_installments,
    p_purchase_payment_details,
    'active',
    p_notes,
    p_created_by,
    p_created_by
  )
  returning id into v_client_combo_id;

  return v_client_combo_id;
end;
$$;

drop function if exists public.finalize_appointment_with_combo(uuid, uuid, uuid, text);

create or replace function public.finalize_appointment_with_combo(
  p_appointment_id uuid,
  p_client_combo_id uuid,
  p_used_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_combo public.client_combos%rowtype;
  v_category_id uuid;
  v_combo_usage_id uuid;
  v_new_remaining integer;
  v_new_status text;
  v_production_value numeric(10,2);
  v_payment_details jsonb;
  v_old_data jsonb;
  v_new_data jsonb;
begin
  select *
    into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Agendamento nao encontrado.';
  end if;

  if v_appointment.status_code = 'completed' then
    raise exception 'Este atendimento ja foi finalizado.';
  end if;

  if v_appointment.status_code in ('cancelled', 'no_show', 'rescheduled') then
    raise exception 'Este atendimento nao pode ser finalizado.';
  end if;

  if exists (
    select 1
    from public.combo_usages
    where appointment_id = v_appointment.id
  ) then
    raise exception 'Este atendimento ja consumiu um combo.';
  end if;

  select *
    into v_combo
  from public.client_combos
  where id = p_client_combo_id
  for update;

  if not found then
    raise exception 'Combo nao encontrado.';
  end if;

  if v_combo.client_id is distinct from v_appointment.client_id then
    raise exception 'Este combo nao pertence ao cliente selecionado.';
  end if;

  if v_combo.status <> 'active' then
    raise exception 'Este combo nao esta ativo.';
  end if;

  if v_combo.expiration_date < current_date then
    update public.client_combos
       set status = 'expired',
           updated_by = p_used_by,
           updated_at = now()
     where id = v_combo.id;
    raise exception 'Este combo esta expirado.';
  end if;

  if v_combo.remaining_sessions <= 0 then
    raise exception 'Este combo nao possui saldo disponivel.';
  end if;

  select category_id
    into v_category_id
  from public.procedures
  where id = v_appointment.procedure_id;

  if v_combo.linked_type = 'procedure' and v_combo.procedure_id is distinct from v_appointment.procedure_id then
    raise exception 'Este combo nao e compativel com este servico.';
  end if;

  if v_combo.linked_type = 'category' and v_combo.category_id is distinct from v_category_id then
    raise exception 'Este combo nao e compativel com esta categoria.';
  end if;

  v_production_value := coalesce(v_appointment.price_at_booking, 0);
  v_old_data := to_jsonb(v_appointment);
  v_new_remaining := v_combo.remaining_sessions - 1;
  v_new_status := case when v_new_remaining = 0 then 'completed' else 'active' end;

  insert into public.combo_usages (
    client_combo_id,
    appointment_id,
    client_id,
    procedure_id,
    professional_id,
    sessions_used,
    production_value,
    used_by
  )
  values (
    v_combo.id,
    v_appointment.id,
    v_appointment.client_id,
    v_appointment.procedure_id,
    v_appointment.professional_id,
    1,
    v_production_value,
    p_used_by
  )
  returning id into v_combo_usage_id;

  v_payment_details := jsonb_build_object(
    'type', 'combo',
    'client_combo_id', v_combo.id,
    'combo_usage_id', v_combo_usage_id,
    'combo_name', v_combo.name,
    'sessions_used', 1,
    'production_value', v_production_value
  );

  update public.client_combos
     set used_sessions = used_sessions + 1,
         remaining_sessions = v_new_remaining,
         status = v_new_status,
         updated_by = p_used_by,
         updated_at = now()
   where id = v_combo.id;

  update public.appointments
     set status_code = 'completed',
         payment_method = 'combo',
         payment_installments = null,
         payment_details = v_payment_details,
         paid_amount = 0,
         updated_by = p_used_by,
         updated_at = now()
   where id = v_appointment.id;

  v_new_data := v_old_data
    || jsonb_build_object(
      'status_code', 'completed',
      'payment_method', 'combo',
      'payment_installments', null,
      'payment_details', v_payment_details,
      'paid_amount', 0,
      'updated_by', p_used_by
    );

  if to_regclass('public.appointment_history') is not null then
    insert into public.appointment_history (
      appointment_id,
      changed_by,
      action,
      reason,
      old_data,
      new_data
    )
    values (
      v_appointment.id,
      p_used_by,
      'completed',
      'Atendimento finalizado com combo',
      v_old_data,
      v_new_data
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'appointment_id', v_appointment.id,
    'client_combo_id', v_combo.id,
    'combo_usage_id', v_combo_usage_id,
    'remaining_sessions', v_new_remaining,
    'message', 'Atendimento finalizado com combo.'
  );
end;
$$;
