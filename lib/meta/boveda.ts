/**
 * El token de Meta vive cifrado en Supabase Vault (ADR-011).
 *
 * Se escribe por un RPC que solo puede ejecutar `service_role`, o sea la clave
 * secreta. Ni la publicable ni un usuario logueado pueden leerlo ni pisarlo.
 *
 * Solo servidor: usa SUPABASE_SECRET_KEY.
 */

/** Nombre del secreto en Vault. Es lo que va en `cuentas_meta.token_ref`. */
export const NOMBRE_SECRETO_META = 'meta_access_token'

export async function guardarTokenMeta(
  p: { url: string; secretKey: string; token: string },
  f: typeof fetch,
): Promise<void> {
  const respuesta = await f(`${p.url}/rest/v1/rpc/guardar_token_meta`, {
    method: 'POST',
    headers: { apikey: p.secretKey, 'content-type': 'application/json' },
    body: JSON.stringify({ p_nombre: NOMBRE_SECRETO_META, p_token: p.token }),
  })
  if (!respuesta.ok) {
    // El cuerpo de Supabase no trae el token, pero por las dudas no se propaga.
    throw new Error(`No se pudo guardar el token en Vault (Supabase respondió ${respuesta.status})`)
  }
}
