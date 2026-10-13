/**
 * Cliente mínimo de PostgREST para el servidor.
 *
 * Usa la clave secreta (sb_secret_…), que saltea RLS: solo lo llaman el cron y
 * el backend (regla dura #5). Va con fetch inyectado, como el resto de lib/,
 * para testear sin red y sin sumar una dependencia.
 */

type Fetch = typeof fetch

export type Supabase = { readonly url: string; readonly secretKey: string }

export class ErrorSupabase extends Error {
  override name = 'ErrorSupabase'
  // Sin parameter properties: el type stripping de Node (scripts/) no las acepta.
  readonly status: number
  constructor(mensaje: string, status: number) {
    super(mensaje)
    this.status = status
  }
}

/** PostgREST acepta cuerpos grandes, pero una tanda fallida se reintenta más barato. */
const TANDA = 500

const headers = (s: Supabase, prefer?: string) => ({
  apikey: s.secretKey,
  'content-type': 'application/json',
  ...(prefer ? { prefer } : {}),
})

async function pedir<T>(
  s: Supabase,
  ruta: string,
  params: Record<string, string>,
  init: RequestInit,
  f: Fetch,
): Promise<T> {
  const url = new URL(`${s.url}/rest/v1/${ruta}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const respuesta = await f(url, init)
  const texto = await respuesta.text()
  if (!respuesta.ok) {
    let mensaje = texto
    try {
      mensaje = (JSON.parse(texto) as { message?: string }).message ?? texto
    } catch {}
    throw new ErrorSupabase(`Supabase ${respuesta.status} en ${ruta}: ${mensaje}`, respuesta.status)
  }
  return (texto ? JSON.parse(texto) : null) as T
}

export async function upsert<T>(
  s: Supabase,
  tabla: string,
  filas: readonly object[],
  onConflict: string,
  f: Fetch,
): Promise<T[]> {
  const resultado: T[] = []
  for (let i = 0; i < filas.length; i += TANDA) {
    const tanda = await pedir<T[]>(
      s,
      tabla,
      { on_conflict: onConflict },
      {
        method: 'POST',
        headers: headers(s, 'resolution=merge-duplicates,return=representation'),
        body: JSON.stringify(filas.slice(i, i + TANDA)),
      },
      f,
    )
    resultado.push(...tanda)
  }
  return resultado
}

export async function insertar<T>(s: Supabase, tabla: string, fila: object, f: Fetch): Promise<T> {
  const [creada] = await pedir<T[]>(
    s,
    tabla,
    {},
    { method: 'POST', headers: headers(s, 'return=representation'), body: JSON.stringify(fila) },
    f,
  )
  return creada!
}

export async function actualizar(
  s: Supabase,
  tabla: string,
  donde: Record<string, string>,
  cambios: object,
  f: Fetch,
): Promise<void> {
  const filtro = Object.fromEntries(Object.entries(donde).map(([k, v]) => [k, `eq.${v}`]))
  await pedir(s, tabla, filtro, { method: 'PATCH', headers: headers(s), body: JSON.stringify(cambios) }, f)
}

export const seleccionar = <T>(s: Supabase, tabla: string, params: Record<string, string>, f: Fetch) =>
  pedir<T[]>(s, tabla, params, { method: 'GET', headers: headers(s) }, f)

export const rpc = <T>(s: Supabase, funcion: string, args: object, f: Fetch) =>
  pedir<T>(s, `rpc/${funcion}`, {}, { method: 'POST', headers: headers(s), body: JSON.stringify(args) }, f)
