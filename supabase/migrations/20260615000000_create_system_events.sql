create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  appointment_id uuid,
  client_id uuid,
  professional_id uuid,
  procedure_id uuid,
  schedule_block_id uuid,
  combo_id uuid,
  user_id uuid,
  title text not null,
  description text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_events enable row level security;

grant select, insert on public.system_events to authenticated;

drop policy if exists "system_events_select_authenticated" on public.system_events;
create policy "system_events_select_authenticated"
on public.system_events
for select
to authenticated
using (true);

drop policy if exists "system_events_insert_authenticated" on public.system_events;
create policy "system_events_insert_authenticated"
on public.system_events
for insert
to authenticated
with check (true);

create index if not exists idx_system_events_created_at
on public.system_events (created_at desc);

create index if not exists idx_system_events_event_type
on public.system_events (event_type);

create index if not exists idx_system_events_appointment_id
on public.system_events (appointment_id);

create index if not exists idx_system_events_client_id
on public.system_events (client_id);

create index if not exists idx_system_events_professional_id
on public.system_events (professional_id);

create index if not exists idx_system_events_user_id
on public.system_events (user_id);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.capture_appointment_system_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_title text;
  v_reason text;
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.system_events
    where appointment_id = old.id;
    return old;
  end if;

  if tg_op = 'INSERT' then
    v_event_type := 'appointment_created';
    v_title := 'Agendamento criado';
    v_reason := null;
    v_user_id := coalesce(new.created_by, public.current_app_user_id());
  elsif old.status_code is distinct from new.status_code then
    v_event_type := case new.status_code
      when 'confirmed' then 'appointment_confirmed'
      when 'completed' then 'appointment_completed'
      when 'cancelled' then 'appointment_cancelled'
      when 'rescheduled' then 'appointment_rescheduled'
      else null
    end;
    v_title := case new.status_code
      when 'confirmed' then 'Agendamento confirmado'
      when 'completed' then 'Agendamento finalizado'
      when 'cancelled' then 'Agendamento cancelado'
      when 'rescheduled' then 'Agendamento reagendado'
      else null
    end;
    v_reason := case
      when new.status_code = 'cancelled' then new.cancellation_reason
      when new.status_code = 'rescheduled' then new.notes
      else null
    end;
    v_user_id := coalesce(new.updated_by, public.current_app_user_id());
  else
    return new;
  end if;

  if v_event_type is null then
    return new;
  end if;

  begin
    insert into public.system_events (
      event_type,
      entity_type,
      entity_id,
      appointment_id,
      client_id,
      professional_id,
      procedure_id,
      user_id,
      title,
      description,
      reason,
      metadata
    )
    values (
      v_event_type,
      'appointment',
      new.id,
      new.id,
      new.client_id,
      new.professional_id,
      new.procedure_id,
      v_user_id,
      v_title,
      format(
        'Agendamento em %s das %s às %s.',
        to_char(new.scheduled_date, 'DD/MM/YYYY'),
        to_char(new.start_time, 'HH24:MI'),
        to_char(new.end_time, 'HH24:MI')
      ),
      v_reason,
      jsonb_build_object(
        'old_status', case when tg_op = 'UPDATE' then old.status_code else null end,
        'new_status', new.status_code,
        'appointment_date', new.scheduled_date,
        'start_time', new.start_time,
        'end_time', new.end_time,
        'price_at_booking', new.price_at_booking,
        'notes', new.notes
      )
    );
  exception when others then
    raise warning 'Não foi possível registrar evento do agendamento %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'Falha inesperada ao auditar agendamento: %', sqlerrm;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_appointment_system_event on public.appointments;
create trigger trg_capture_appointment_system_event
after insert or update or delete on public.appointments
for each row execute function public.capture_appointment_system_event();

create or replace function public.capture_schedule_block_system_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_appointments jsonb := '[]'::jsonb;
  v_user_id uuid;
begin
  if tg_op = 'INSERT' then
    v_user_id := coalesce(new.created_by, public.current_app_user_id());

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'appointment_id', a.id,
          'client_name', c.full_name,
          'phone', c.phone,
          'procedure_name', p.name,
          'start_time', a.start_time,
          'end_time', a.end_time
        )
        order by a.start_time
      ),
      '[]'::jsonb
    )
    into v_affected_appointments
    from public.appointments a
    left join public.clients c on c.id = a.client_id
    left join public.procedures p on p.id = a.procedure_id
    where a.scheduled_date = new.block_date
      and (new.professional_id is null or a.professional_id = new.professional_id)
      and a.start_time < new.end_time
      and a.end_time > new.start_time
      and coalesce(a.status_code, '') not in ('cancelled', 'no_show', 'rescheduled');

    begin
      insert into public.system_events (
        event_type,
        entity_type,
        entity_id,
        professional_id,
        schedule_block_id,
        user_id,
        title,
        description,
        reason,
        metadata
      )
      values (
        'schedule_block_created',
        'schedule_block',
        new.id,
        new.professional_id,
        new.id,
        v_user_id,
        'Horário bloqueado',
        format(
          'Horário bloqueado em %s das %s às %s.',
          to_char(new.block_date, 'DD/MM/YYYY'),
          to_char(new.start_time, 'HH24:MI'),
          to_char(new.end_time, 'HH24:MI')
        ),
        new.reason,
        jsonb_build_object(
          'block_date', new.block_date,
          'start_time', new.start_time,
          'end_time', new.end_time,
          'affected_appointments', v_affected_appointments
        )
      );
    exception when others then
      raise warning 'Não foi possível registrar criação do bloqueio %: %', new.id, sqlerrm;
    end;

    return new;
  end if;

  v_user_id := public.current_app_user_id();

  begin
    insert into public.system_events (
      event_type,
      entity_type,
      entity_id,
      professional_id,
      schedule_block_id,
      user_id,
      title,
      description,
      reason,
      metadata
    )
    values (
      'schedule_block_removed',
      'schedule_block',
      old.id,
      old.professional_id,
      old.id,
      v_user_id,
      'Horário desbloqueado',
      format(
        'Bloqueio removido de %s das %s às %s.',
        to_char(old.block_date, 'DD/MM/YYYY'),
        to_char(old.start_time, 'HH24:MI'),
        to_char(old.end_time, 'HH24:MI')
      ),
      old.reason,
      jsonb_build_object(
        'block_date', old.block_date,
        'start_time', old.start_time,
        'end_time', old.end_time
      )
    );
  exception when others then
    raise warning 'Não foi possível registrar remoção do bloqueio %: %', old.id, sqlerrm;
  end;

  return old;
exception when others then
  raise warning 'Falha inesperada ao auditar bloqueio de agenda: %', sqlerrm;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_schedule_block_system_event on public.schedule_blocks;
create trigger trg_capture_schedule_block_system_event
after insert or delete on public.schedule_blocks
for each row execute function public.capture_schedule_block_system_event();

create or replace function public.capture_combo_system_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_entity_id uuid;
  v_appointment_id uuid;
  v_client_id uuid;
  v_professional_id uuid;
  v_procedure_id uuid;
  v_user_id uuid;
  v_title text;
  v_description text;
  v_metadata jsonb;
begin
  if tg_table_name = 'client_combos' then
    if tg_op <> 'INSERT' then
      return new;
    end if;

    v_event_type := 'combo_sold';
    v_entity_id := new.id;
    v_client_id := new.client_id;
    v_procedure_id := new.procedure_id;
    v_user_id := coalesce(new.created_by, public.current_app_user_id());
    v_title := 'Combo vendido';
    v_description := format('Combo %s vinculado ao cliente.', new.name);
    v_metadata := jsonb_build_object(
      'combo_name', new.name,
      'total_sessions', new.total_sessions,
      'package_price', new.package_price,
      'start_date', new.start_date,
      'expiration_date', new.expiration_date,
      'payment_method', new.purchase_payment_method
    );
  else
    v_event_type := 'combo_used';
    v_entity_id := new.client_combo_id;
    v_appointment_id := new.appointment_id;
    v_client_id := new.client_id;
    v_professional_id := new.professional_id;
    v_procedure_id := new.procedure_id;
    v_user_id := coalesce(new.used_by, public.current_app_user_id());
    v_title := 'Combo utilizado';
    v_description := format('%s sessão(ões) utilizada(s) no atendimento.', new.sessions_used);
    v_metadata := jsonb_build_object(
      'combo_usage_id', new.id,
      'sessions_used', new.sessions_used,
      'production_value', new.production_value,
      'used_at', new.used_at,
      'notes', new.notes
    );
  end if;

  begin
    insert into public.system_events (
      event_type,
      entity_type,
      entity_id,
      appointment_id,
      client_id,
      professional_id,
      procedure_id,
      combo_id,
      user_id,
      title,
      description,
      metadata
    )
    values (
      v_event_type,
      'combo',
      v_entity_id,
      v_appointment_id,
      v_client_id,
      v_professional_id,
      v_procedure_id,
      v_entity_id,
      v_user_id,
      v_title,
      v_description,
      v_metadata
    );
  exception when others then
    raise warning 'Não foi possível registrar evento de combo %: %', v_entity_id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'Falha inesperada ao auditar combo: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_capture_client_combo_system_event on public.client_combos;
create trigger trg_capture_client_combo_system_event
after insert on public.client_combos
for each row execute function public.capture_combo_system_event();

drop trigger if exists trg_capture_combo_usage_system_event on public.combo_usages;
create trigger trg_capture_combo_usage_system_event
after insert on public.combo_usages
for each row execute function public.capture_combo_system_event();

create or replace function public.capture_client_system_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_title text;
  v_user_id uuid;
begin
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  v_event_type := case when tg_op = 'INSERT' then 'client_created' else 'client_updated' end;
  v_title := case when tg_op = 'INSERT' then 'Cliente criado' else 'Cliente editado' end;
  v_user_id := public.current_app_user_id();

  begin
    insert into public.system_events (
      event_type,
      entity_type,
      entity_id,
      client_id,
      user_id,
      title,
      description,
      metadata
    )
    values (
      v_event_type,
      'client',
      new.id,
      new.id,
      v_user_id,
      v_title,
      format('Cadastro de %s.', new.full_name),
      jsonb_build_object(
        'phone', new.phone,
        'is_active', new.is_active,
        'changed_fields', case
          when tg_op = 'UPDATE' then jsonb_build_object(
            'full_name', jsonb_build_array(old.full_name, new.full_name),
            'phone', jsonb_build_array(old.phone, new.phone),
            'is_active', jsonb_build_array(old.is_active, new.is_active)
          )
          else '{}'::jsonb
        end
      )
    );
  exception when others then
    raise warning 'Não foi possível registrar evento do cliente %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'Falha inesperada ao auditar cliente: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_capture_client_system_event on public.clients;
create trigger trg_capture_client_system_event
after insert or update on public.clients
for each row execute function public.capture_client_system_event();

create or replace view public.v_system_events_full as
select
  se.id,
  se.event_type,
  case se.event_type
    when 'appointment_created' then 'Agendamento criado'
    when 'appointment_confirmed' then 'Agendamento confirmado'
    when 'appointment_completed' then 'Agendamento finalizado'
    when 'appointment_cancelled' then 'Agendamento cancelado'
    when 'appointment_rescheduled' then 'Agendamento reagendado'
    when 'schedule_block_created' then 'Horário bloqueado'
    when 'schedule_block_removed' then 'Horário desbloqueado'
    when 'combo_sold' then 'Combo vendido'
    when 'combo_used' then 'Combo utilizado'
    when 'client_created' then 'Cliente criado'
    when 'client_updated' then 'Cliente editado'
    else se.title
  end as event_label,
  se.entity_type,
  se.entity_id,
  se.appointment_id,
  se.client_id,
  c.full_name as client_name,
  c.phone as client_phone,
  se.professional_id,
  pr.name as professional_name,
  se.procedure_id,
  p.name as procedure_name,
  se.schedule_block_id,
  se.combo_id,
  se.user_id,
  coalesce(u.name, 'Usuário não identificado') as responsible_name,
  u.email as responsible_email,
  se.title,
  se.description,
  se.reason,
  se.metadata,
  se.created_at
from public.system_events se
left join public.clients c on c.id = se.client_id
left join public.professionals pr on pr.id = se.professional_id
left join public.procedures p on p.id = se.procedure_id
left join public.users u on u.id = se.user_id;

grant select on public.v_system_events_full to authenticated;
