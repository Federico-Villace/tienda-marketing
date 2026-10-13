/**
 * Validación común antes de que un token de Meta entre a Vault.
 *
 * La usan el callback del login y `pnpm guardar-token-meta`. Un token entra solo
 * si es válido, es de nuestra app, trae los permisos del MVP y ve el Business
 * del cliente. Así nadie pisa un token bueno con uno peor (ADR-013).
 */

import { inspeccionarToken, permisosFaltantes, verificarAccesoNegocio, type InfoToken } from './oauth.ts'
import { guardarTokenMeta } from './boveda.ts'

type Fetch = typeof fetch

export type RechazoToken = {
  readonly ok: false
  readonly motivo: 'token_invalido' | 'permisos_insuficientes' | 'sin_acceso_negocio'
  readonly faltan?: readonly string[]
}

export type ResultadoImportacion =
  | { readonly ok: true; readonly tipo: string; readonly vence: string }
  | RechazoToken

export async function validarToken(
  info: InfoToken,
  p: { appId: string; version: string; token: string; businessId: string },
  f: Fetch,
): Promise<RechazoToken | null> {
  if (!info.valido || info.appId !== p.appId) return { ok: false, motivo: 'token_invalido' }

  const faltan = permisosFaltantes(info.permisos)
  if (faltan.length > 0) return { ok: false, motivo: 'permisos_insuficientes', faltan }

  const veNegocio = await verificarAccesoNegocio(
    { version: p.version, token: p.token, businessId: p.businessId },
    f,
  )
  return veNegocio ? null : { ok: false, motivo: 'sin_acceso_negocio' }
}

export async function importarToken(
  p: {
    token: string
    appId: string
    appSecret: string
    version: string
    businessId: string
    supabaseUrl: string
    secretKey: string
  },
  f: Fetch,
): Promise<ResultadoImportacion> {
  const info = await inspeccionarToken(
    { appId: p.appId, appSecret: p.appSecret, version: p.version, token: p.token },
    f,
  )
  const rechazo = await validarToken(info, p, f)
  if (rechazo) return rechazo

  await guardarTokenMeta({ url: p.supabaseUrl, secretKey: p.secretKey, token: p.token }, f)
  return {
    ok: true,
    tipo: info.tipo,
    vence: info.venceEn ? info.venceEn.toISOString() : 'nunca',
  }
}
