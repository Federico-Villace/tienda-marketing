/**
 * Lo que muestra la portada (app/page.tsx). Todo es lectura del servidor y cada pieza
 * falla por separado: si la base o Storage no responden, la portada sigue en pie con
 * menos cosas (nunca rompe). Nada de esto llama a Meta ni a un LLM.
 */

import { destacarPublicaciones, type PublicacionDestacada } from '../datos/destacados.ts'
import { filtrarPublicaciones } from '../datos/filtros.ts'
import { MARCAS, marcaPorId } from '../datos/marcas.ts'
import { leerPublicaciones } from '../datos/publicaciones.ts'
import { rangoDias } from '../ingesta/transformar.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { firmarPlaca } from '../promocion/placa.ts'
import { seleccionar, type Supabase } from '../supabase/rest.ts'

type Fetch = typeof fetch
type Entorno = Record<string, string | undefined>

export const VENTANA_PORTADA_DIAS = 30

export type PlacaPortada =
  | { tipo: 'fija'; url: string; pie: string; href: null }
  | { tipo: 'aprobada'; url: string; pie: string; href: string }
  | null

export type Resultados = { mejor: PublicacionDestacada | null; peor: PublicacionDestacada | null }

export type Portada = {
  placa: PlacaPortada
  /** null = no hay datos o falló la lectura: se muestra solo el texto y el link. */
  resultados: Resultados | null
  /** Promociones (las tandas cuentan una) con algo por terminar. 0 = no se muestra. */
  pendientes: number
}

/** Solo una ruta propia (/algo.png): nada de otros sitios ni de `//host`. */
export function placaFija(entorno: Entorno): string | null {
  const v = entorno.HOME_PLACA_FIJA?.trim()
  return v && /^\/(?!\/)[^\s:?#\\]+$/.test(v) ? v : null
}

const supabaseDe = (e: Entorno): Supabase | null => {
  const url = e.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = e.SUPABASE_SECRET_KEY?.trim()
  return url && secretKey ? { url, secretKey } : null
}

async function ultimaAprobada(s: Supabase, f: Fetch): Promise<PlacaPortada> {
  const [fila] = await seleccionar<{ id: string; marca_id: string; modelo: string; placa_ruta: string | null }>(
    s,
    'promociones',
    {
      select: 'id,marca_id,modelo,placa_ruta',
      organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`,
      estado: 'eq.aprobada',
      placa_ruta: 'not.is.null',
      order: 'actualizado_en.desc',
      limit: '1',
    },
    f,
  )
  if (!fila?.placa_ruta) return null
  const url = await firmarPlaca(s, fila.placa_ruta, f)
  if (!url) return null
  const marca = marcaPorId(fila.marca_id)?.nombre
  return {
    tipo: 'aprobada',
    url,
    pie: ['Última promoción aprobada', marca, fila.modelo].filter(Boolean).join(' · '),
    href: `/promocionar/${fila.id}`,
  }
}

async function resultados(s: Supabase, f: Fetch, ahora: Date): Promise<Resultados | null> {
  const { desde, hasta } = rangoDias(ahora, VENTANA_PORTADA_DIAS)
  const { publicaciones } = await leerPublicaciones(s, ORGANIZACION_PILOTO_ID, desde, f, hasta)
  const filtradas = filtrarPublicaciones(publicaciones, { marcaIds: MARCAS.map((m) => m.id), plataforma: 'todas', desde, hasta })
  const d = destacarPublicaciones(filtradas, hasta)
  const mejor = d.mejores[0] ?? null
  const peor = d.peores[0] ?? null
  return mejor || peor ? { mejor, peor } : null
}

/** Cuántas "cosas para terminar": una tanda cuenta una sola vez, igual que la pestaña. */
async function pendientes(s: Supabase, f: Fetch): Promise<number> {
  const filas = await seleccionar<{ id: string; tanda_id: string | null }>(
    s,
    'promociones',
    { select: 'id,tanda_id', organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, estado: 'eq.borrador', limit: '200' },
    f,
  )
  return new Set(filas.map((x) => x.tanda_id ?? x.id)).size
}

const o = async <T>(p: () => Promise<T>, vacio: T): Promise<T> => {
  try {
    return await p()
  } catch {
    return vacio
  }
}

export async function cargarPortada(entorno: Entorno, f: Fetch, ahora: Date = new Date()): Promise<Portada> {
  const s = supabaseDe(entorno)
  const fija = placaFija(entorno)
  if (!s) {
    return { placa: fija ? { tipo: 'fija', url: fija, pie: 'Ejemplo hecho con la app', href: null } : null, resultados: null, pendientes: 0 }
  }
  const [placa, res, pend] = await Promise.all([
    fija
      ? Promise.resolve<PlacaPortada>({ tipo: 'fija', url: fija, pie: 'Ejemplo hecho con la app', href: null })
      : o(() => ultimaAprobada(s, f), null),
    o(() => resultados(s, f, ahora), null),
    o(() => pendientes(s, f), 0),
  ])
  return { placa, resultados: res, pendientes: pend }
}
