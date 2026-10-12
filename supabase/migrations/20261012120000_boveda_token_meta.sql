-- 0002 · Token de Meta en Supabase Vault (ADR-011)
--
-- El token que devuelve el login de Facebook se guarda CIFRADO en Vault, nunca
-- en una tabla común. Solo `service_role` (la clave secreta del backend) puede
-- escribirlo o leerlo: anon y authenticated no tienen permiso de ejecución.

create extension if not exists supabase_vault with schema vault;

create or replace function public.guardar_token_meta(p_nombre text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nombre;
  if v_id is null then
    perform vault.create_secret(p_token, p_nombre, 'Token de Meta (login de Facebook)');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end;
$$;

create or replace function public.leer_token_meta(p_nombre text)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nombre;
$$;

revoke all on function public.guardar_token_meta(text, text) from public, anon, authenticated;
revoke all on function public.leer_token_meta(text) from public, anon, authenticated;
grant execute on function public.guardar_token_meta(text, text) to service_role;
grant execute on function public.leer_token_meta(text) to service_role;
