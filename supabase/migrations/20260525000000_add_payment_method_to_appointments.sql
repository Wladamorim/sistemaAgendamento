alter table public.appointments
add column if not exists payment_method text,
add column if not exists payment_installments integer,
add column if not exists payment_details jsonb,
add column if not exists paid_amount numeric(10,2);
