/**
 * Storage de Supabase por REST, con la clave secreta (como lo hace supabase-js).
 * Bucket privado y sin policies: solo el servidor lee y escribe. Los mensajes
 * de error nunca llevan la clave.
 */

import { ErrorSupabase, type Supabase } from './rest.ts'

type Fetch = typeof fetch

const cabeceras = (s: Supabase) => ({ apikey: s.secretKey, authorization: `Bearer ${s.secretKey}` })

async function fallar(r: Response, que: string, secreto: string): Promise<never> {
  const texto = await r.text()
  let mensaje = texto
  try {
    mensaje = (JSON.parse(texto) as { message?: string }).message ?? texto
  } catch {}
  throw new ErrorSupabase(`Storage ${r.status} en ${que}: ${mensaje.split(secreto).join('[clave]').slice(0, 200)}`, r.status)
}

export async function subirObjeto(
  s: Supabase,
  bucket: string,
  ruta: string,
  bytes: Uint8Array,
  mime: string,
  f: Fetch,
): Promise<void> {
  const r = await f(`${s.url}/storage/v1/object/${bucket}/${ruta}`, {
    method: 'POST',
    headers: { ...cabeceras(s), 'content-type': mime, 'x-upsert': 'false' },
    body: bytes as BodyInit,
  })
  if (!r.ok) await fallar(r, `subir ${bucket}`, s.secretKey)
}

/**
 * ruta → URL firmada completa. Las rutas que no se pudieron firmar no figuran.
 * Con `descarga` la URL lleva `&download=nombre`: el navegador baja el archivo con ese nombre.
 */
export async function firmarUrls(
  s: Supabase,
  bucket: string,
  rutas: readonly string[],
  segundos: number,
  f: Fetch,
  opciones: { descarga?: string } = {},
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>()
  if (rutas.length === 0) return resultado
  const r = await f(`${s.url}/storage/v1/object/sign/${bucket}`, {
    method: 'POST',
    headers: { ...cabeceras(s), 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: segundos, paths: rutas }),
  })
  if (!r.ok) await fallar(r, `firmar ${bucket}`, s.secretKey)
  for (const x of (await r.json()) as { path: string; signedURL: string | null }[]) {
    if (x.signedURL) {
      const descarga = opciones.descarga ? `&download=${encodeURIComponent(opciones.descarga)}` : ''
      resultado.set(x.path, `${s.url}/storage/v1${x.signedURL}${descarga}`)
    }
  }
  return resultado
}

/** Descarga un objeto de un bucket privado. Falla con ErrorSupabase si no se puede. */
export async function descargarObjeto(s: Supabase, bucket: string, ruta: string, f: Fetch): Promise<Uint8Array> {
  const r = await f(`${s.url}/storage/v1/object/authenticated/${bucket}/${ruta}`, { headers: cabeceras(s) })
  if (!r.ok) await fallar(r, `descargar ${bucket}`, s.secretKey)
  return new Uint8Array(await r.arrayBuffer())
}

export async function borrarObjetos(s: Supabase, bucket: string, rutas: readonly string[], f: Fetch): Promise<void> {
  if (rutas.length === 0) return
  const r = await f(`${s.url}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...cabeceras(s), 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: rutas }),
  })
  if (!r.ok) await fallar(r, `borrar ${bucket}`, s.secretKey)
}
