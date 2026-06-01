-- RPC to finalize appointment with multiple items and mixed payment methods
create or replace function public.finalize_appointment_with_items(
  p_appointment_id uuid,
  p_used_by uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_payment_method text;
  v_client_combo_id uuid;
  v_paid_amount numeric(10,2);
  v_production_total numeric(10,2) := 0;
  v_cash_received numeric(10,2) := 0;
  v_combo_total numeric(10,2) := 0;
  v_combo_usage_id uuid;
  v_procedure_id uuid;
  v_professional_id uuid;
  v_procedure_name text;
  v_client_id uuid;
  v_client_combo public.client_combos%rowtype;
  v_appointment_item public.appointment_items%rowtype;
  v_item_index integer := 0;
  v_payment_methods text[] := array[]::text[];
  v_response_items jsonb := '[]'::jsonb;
  v_item_response jsonb;
begin
  -- Validate appointment exists
  select * into v_appointment from public.appointments where id = p_appointment_id;
  
  if v_appointment is null then
    raise exception 'Agendamento nao encontrado.';
  end if;

  if v_appointment.status_code = 'completed' then
    raise exception 'Agendamento ja foi finalizado.';
  end if;

  if v_appointment.status_code = 'cancelled' then
    raise exception 'Agendamento foi cancelado.';
  end if;

  v_client_id := v_appointment.client_id;

  -- Process each item
  for v_item in select jsonb_array_elements(p_items)
  loop
    v_item_index := v_item_index + 1;
    v_item_id := (v_item->>'appointment_item_id')::uuid;
    v_payment_method := v_item->>'payment_method';
    v_paid_amount := coalesce((v_item->>'paid_amount')::numeric(10,2), 0);

    -- Get appointment item
    select * into v_appointment_item 
    from public.appointment_items 
    where id = v_item_id and appointment_id = p_appointment_id;

    if v_appointment_item is null then
      raise exception 'Item do agendamento nao encontrado: %', v_item_id;
    end if;

    v_procedure_id := v_appointment_item.procedure_id;
    v_professional_id := v_appointment_item.professional_id;
    
    -- Get procedure name
    select name into v_procedure_name from public.procedures where id = v_procedure_id;

    -- Accumulate totals
    v_production_total := v_production_total + v_appointment_item.price_at_booking;
    v_payment_methods := array_append(v_payment_methods, v_payment_method);

    -- Handle combo payment
    if v_payment_method = 'combo' then
      v_client_combo_id := (v_item->>'client_combo_id')::uuid;
      
      -- Get combo info
      select * into v_client_combo 
      from public.client_combos 
      where id = v_client_combo_id and client_id = v_client_id;

      if v_client_combo is null then
        raise exception 'Combo nao encontrado ou nao pertence a este cliente.';
      end if;

      if v_client_combo.effective_status != 'active' then
        raise exception 'Combo "%s" nao esta ativo.', v_client_combo.name;
      end if;

      if v_client_combo.remaining_sessions <= 0 then
        raise exception 'Combo "%s" nao possui saldo.', v_client_combo.name;
      end if;

      v_combo_total := v_combo_total + v_appointment_item.price_at_booking;

      -- Create combo usage
      insert into public.combo_usages (
        client_combo_id,
        appointment_id,
        client_id,
        procedure_id,
        professional_id,
        sessions_used,
        production_value,
        used_by
      ) values (
        v_client_combo_id,
        p_appointment_id,
        v_client_id,
        v_procedure_id,
        v_professional_id,
        1,
        v_appointment_item.price_at_booking,
        p_used_by
      ) returning id into v_combo_usage_id;

      -- Update combo usage item field
      update public.appointment_items
      set combo_usage_id = v_combo_usage_id
      where id = v_item_id;

      -- Update client combo
      update public.client_combos
      set 
        used_sessions = used_sessions + 1,
        remaining_sessions = remaining_sessions - 1,
        status = case when remaining_sessions - 1 <= 0 then 'completed' else status end,
        updated_at = now()
      where id = v_client_combo_id;

    else
      -- Non-combo payment
      v_cash_received := v_cash_received + v_paid_amount;
    end if;

    -- Update appointment item
    update public.appointment_items
    set 
      payment_method = v_payment_method,
      payment_installments = coalesce((v_item->>'payment_installments')::integer, null),
      payment_details = case 
        when v_item->'payment_details' is not null then v_item->'payment_details'
        else null
      end,
      paid_amount = v_paid_amount,
      updated_at = now()
    where id = v_item_id;

    -- Build response item
    v_item_response := jsonb_build_object(
      'appointment_item_id', v_item_id,
      'procedure_id', v_procedure_id,
      'procedure_name', v_procedure_name,
      'payment_method', v_payment_method,
      'paid_amount', v_paid_amount,
      'production_value', v_appointment_item.price_at_booking,
      'combo_usage_id', v_combo_usage_id,
      'client_combo_id', case when v_payment_method = 'combo' then v_client_combo_id else null end,
      'combo_name', case when v_payment_method = 'combo' then v_client_combo.name else null end,
      'sessions_used', case when v_payment_method = 'combo' then 1 else null end
    );
    
    v_response_items := v_response_items || v_item_response;
  end loop;

  -- Determine final payment method
  declare
    v_unique_methods text[];
    v_final_payment_method text;
  begin
    select array_agg(distinct x) into v_unique_methods from unnest(v_payment_methods) as x;
    
    if array_length(v_unique_methods, 1) = 1 then
      v_final_payment_method := v_unique_methods[1];
    else
      v_final_payment_method := 'mixed';
    end if;

    -- Update appointment
    update public.appointments
    set 
      status_code = 'completed',
      payment_method = v_final_payment_method,
      paid_amount = v_cash_received,
      payment_details = jsonb_build_object(
        'type', 'mixed_items',
        'production_total', v_production_total,
        'cash_received', v_cash_received,
        'combo_total', v_combo_total,
        'items', v_response_items
      ),
      updated_at = now()
    where id = p_appointment_id;
  end;

  -- Return summary
  return jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'production_total', v_production_total,
    'cash_received', v_cash_received,
    'combo_total', v_combo_total,
    'payment_method', case 
      when array_length(array_agg(distinct x), 1) = 1 then array_agg(distinct x)[1]
      else 'mixed'
    end,
    'items', v_response_items
  );
exception when others then
  return jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
end;
$$;
