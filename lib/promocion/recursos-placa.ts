/**
 * GET /api/placa-recursos/[id]: sirve al navegador los logos y las texturas de las plantillas de
 * diseño (la vista previa los necesita; viven en assets/, no en public/, así no quedan abiertos sin
 * sesión). Solo ids del manifiesto o de las texturas: nunca una ruta que arme el cliente. Solo lectura.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HEADER_USUARIO } from '../auth/acceso.ts'
import { formatoDe } from '../productor/dimensiones.ts'
import { TEXTURAS } from './diseno/texturas.ts'
import { leerManifiesto, rutaDeLogo } from './logos-servidor.ts'

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const

/** id público → ruta absoluta del archivo. */
export function idsDeRecursos(): Record<string, string> {
  const m = leerManifiesto()
  const ids: Record<string, string> = { logo999: rutaDeLogo(m.logo999.carpeta, m.logo999.archivo) }
  for (const t of Object.entries(TEXTURAS)) ids[`textura-${t[0]}`] = join(process.cwd(), 'assets/texturas', t[1].archivo)
  for (const [marcaId, e] of Object.entries(m.marcas)) for (const l of e.logos) ids[`${marcaId}_${l.id}`] = rutaDeLogo(e.carpeta, l.archivo)
  return ids
}

export async function manejarRecurso(request: Request, id: string): Promise<Response> {
  if (!request.headers.get(HEADER_USUARIO)) return Response.json({ error: 'Iniciá sesión.' }, { status: 401 })
  const ruta = Object.hasOwn(idsDeRecursos(), id) ? idsDeRecursos()[id] : undefined
  if (!ruta) return Response.json({ error: 'No se encontró el recurso.' }, { status: 404 })
  const bytes = new Uint8Array(readFileSync(ruta))
  const formato = formatoDe(bytes)
  if (!formato) return Response.json({ error: 'No se encontró el recurso.' }, { status: 404 })
  return new Response(bytes, { status: 200, headers: { 'content-type': MIME[formato], 'cache-control': 'private, max-age=3600' } })
}
