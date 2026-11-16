/** Lee las verificaciones de texto de la base (solo lectura): la vista de la pantalla y lo que necesita la placa. Sin llamar a nadie. */

import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import { seleccionar, type Supabase } from '../../supabase/rest.ts'
import { estimarVerificacion } from './precios.ts'
import type { Caja01, Diferencia, EstadoVerificacion, VerificacionVista } from './tipos.ts'

type Fetch = typeof fetch

const COLUMNAS = 'id,creativo_id,generacion_id,modelo,textos_hash,estado,diferencias,avisos,zona_logo,fondo_logo,creado_en'

type FilaVerificacion = {
  id: string
  creativo_id: string
  generacion_id: string
  modelo: string
  textos_hash: string
  estado: EstadoVerificacion
  diferencias: Diferencia[] | null
  avisos: Diferencia[] | null
  zona_logo: (Caja01 & { porDefecto?: boolean }) | null
  fondo_logo: 'claro' | 'oscuro' | null
  creado_en: string
}

/** Cuánto sale volver a revisar una imagen cuya revisión falló; null si no hay precio para ese modelo (no tira). */
function costoDeReverificar(modelo: string): number | null {
  try {
    return estimarVerificacion(modelo).topeUsd
  } catch {
    return null
  }
}

function vistaDe(v: FilaVerificacion): VerificacionVista {
  // Solo una revisión que FALLÓ se puede repetir: una que difiere se regenera (no se tira el dado hasta un falso ok).
  const costo = v.estado === 'error' ? costoDeReverificar(v.modelo) : null
  return { id: v.id, estado: v.estado, diferencias: v.diferencias ?? [], avisos: v.avisos ?? [], puedeReverificar: costo !== null, costoReverificarUsd: costo }
}

/** La ÚLTIMA verificación de cada imagen (por fecha). */
export async function leerVerificaciones(supabase: Supabase, creativoIds: readonly string[], f: Fetch): Promise<Map<string, VerificacionVista>> {
  const mapa = new Map<string, VerificacionVista>()
  if (creativoIds.length === 0) return mapa
  const filas = await seleccionar<FilaVerificacion>(
    supabase,
    'verificaciones_texto',
    { select: COLUMNAS, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, creativo_id: `in.(${creativoIds.join(',')})`, order: 'creado_en.desc' },
    f,
  )
  // Vienen de la más nueva a la más vieja: la primera de cada imagen manda.
  for (const v of filas) if (!mapa.has(v.creativo_id)) mapa.set(v.creativo_id, vistaDe(v))
  return mapa
}

export type VerificacionVigente = {
  id: string
  estado: EstadoVerificacion
  /** El hash de los textos contra los que se comparó. */
  textosHash: string
  zonaLogo: Caja01 | null
  fondoLogo: 'claro' | 'oscuro' | null
}

/** La última verificación de UNA imagen: lo que decide si se puede armar la placa y dónde va el logo. */
export async function verificacionVigente(supabase: Supabase, creativoId: string, f: Fetch): Promise<VerificacionVigente | null> {
  const [v] = await seleccionar<FilaVerificacion>(
    supabase,
    'verificaciones_texto',
    { select: COLUMNAS, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, creativo_id: `eq.${creativoId}`, order: 'creado_en.desc', limit: '1' },
    f,
  )
  if (!v) return null
  const z = v.zona_logo
  return { id: v.id, estado: v.estado, textosHash: v.textos_hash, zonaLogo: z ? { x: z.x, y: z.y, w: z.w, h: z.h } : null, fondoLogo: v.fondo_logo }
}
