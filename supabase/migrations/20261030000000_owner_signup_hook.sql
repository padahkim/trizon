begin;

-- Private registration policy only; account asset storage belongs to later issues.
create schema if not exists trizon_auth;
revoke all on schema trizon_auth from public, anon, authenticated;
grant usage on schema trizon_auth to supabase_auth_admin;

create table if not exists trizon_auth.owner_allowlist (
  email text primary key check (email = lower(btrim(email)) and email <> '')
);
alter table trizon_auth.owner_allowlist enable row level security;
revoke all on table trizon_auth.owner_allowlist from public, anon, authenticated, supabase_auth_admin;
grant select (email) on table trizon_auth.owner_allowlist to supabase_auth_admin;
drop policy if exists auth_reads_owner_allowlist on trizon_auth.owner_allowlist;
create policy auth_reads_owner_allowlist on trizon_auth.owner_allowlist
  for select to supabase_auth_admin using (true);

create or replace function trizon_auth.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  candidate text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if candidate is null or candidate = '' or not exists (
    select 1 from trizon_auth.owner_allowlist where email = candidate
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Signup is not permitted'
    ));
  end if;
  return '{}'::jsonb;
exception when others then
  -- Never disclose SQL, table names, or account information to Auth or the caller.
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 500, 'message', 'Signup check unavailable'
  ));
end;
$$;
revoke all on function trizon_auth.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function trizon_auth.before_user_created(jsonb) to supabase_auth_admin;

-- Empty by default: owner enrollment and hosted hook activation are #42.
commit;
