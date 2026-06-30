alter table public.users
add column if not exists last_access_at timestamptz;

grant select (last_access_at) on table public.users to authenticated;

create or replace function public.update_current_user_last_access()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_access_at timestamptz := now();
begin
  if auth.uid() is null then
    return null;
  end if;

  update public.users
  set last_access_at = v_last_access_at
  where auth_user_id = auth.uid();

  return v_last_access_at;
end;
$$;

revoke all on function public.update_current_user_last_access() from public;
grant execute on function public.update_current_user_last_access() to authenticated;

notify pgrst, 'reload schema';
