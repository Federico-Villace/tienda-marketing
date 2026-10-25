/**
 * Lectura de /promocionar/tanda/[id] (ADR-028). La hace el servidor desde page.tsx;
 * el cliente recibe URLs firmadas de vida corta (nunca una ruta ni la organización)
 * y, después de actuar, hace router.refresh(): una sola fuente de verdad.
 */

import { UUID } from '../../agentes/http.ts'
import { MARCAS } from '../../datos/marcas.ts'
import { ORGANIZACION_PILOTO_ID } from '../../organizacion.ts'
import {
  firmar,
  SELECT_CREATIVO,
  SELECT_GEN,
  vistaCreativo,
  vistaGeneracion,
  type CreativoVista,
  type FilaCreativo,
  type FilaGeneracion,
  type GeneracionVista,
} from '../../productor/pantalla.ts'
import { rpc, seleccionar, type Supabase } from '../../supabase/rest.ts'
import { marcaPorId } from '../marca.ts'
import { firmarPlaca } from '../placa.ts'
import { COLUMNAS_PROMOCION, type FilaPromocion, type PromocionVista } from '../tipos.ts'
import { vistaDePromocion } from '../vista.ts'
import { compartenEscena, type ResultadoEscena } from './escena.ts'

type Fetch = typeof fetch

const BUCKET_FOTOS = 'fotos'
const BUCKET_CREATIVOS = 'creativos'

export type HijaDeTanda = {
  promocion: PromocionVista
  marca: { id: string; nombre: string; usuarioIg: string }
  /** La placa (si ya hay) o la foto; null si no se pudo firmar. */
  miniatura: string | null
  /** Tiene texto, imagen y diseño: se puede aprobar. */
  lista: boolean
}

export type TandaVista = {
  tanda: { id: string; creadoEn: string }
  hijas: HijaDeTanda[]
  /** Las hijas vivas (no descartadas): lo que cuenta la pantalla. */
  resumen: { total: number; aprobadas: number; listas: number }
  /** ¿Las hijas en borrador piden la misma escena? Si no, qué difiere. */
  comparten: ResultadoEscena
  foto: { id: string; ancho: number; alto: number; url: string | null; borrada: boolean } | null
  escenas: { generacion: GeneracionVista; creativos: (CreativoVista & { usadaEn: number })[] }[]
  gastadoUsd: number
}

/** Texto, imagen y diseño elegidos: lo que pide aprobar_promocion (más la placa, que se compone al aprobar). */
const estaLista = (h: FilaPromocion): boolean => h.estado === 'borrador' && h.copy !== null && h.escena_creativo_id !== null && h.plantilla !== null

export async function leerTanda(s: Supabase, id: string, f: Fetch, ahora: () => number = Date.now): Promise<TandaVista | null> {
  if (!UUID.test(id)) return null
  const org = { organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` }
  const [tandas, filas] = await Promise.all([
    seleccionar<{ id: string; creado_en: string }>(s, 'tandas_promocion', { select: 'id,creado_en', ...org, id: `eq.${id}`, limit: '1' }, f),
    seleccionar<FilaPromocion>(
      s,
      'promociones',
      { select: COLUMNAS_PROMOCION, ...org, tanda_id: `eq.${id}`, order: 'creado_en.asc,id.asc' },
      f,
    ),
  ])
  const tanda = tandas[0]
  if (!tanda) return null

  const vivas = filas.filter((h) => h.estado !== 'descartada')
  const borradores = filas.filter((h) => h.estado === 'borrador')
  const fotoId = (vivas[0] ?? filas[0])?.foto_id

  const [fotos, gens, gasto] = await Promise.all([
    fotoId
      ? seleccionar<{ id: string; ruta: string | null; ancho: number; alto: number; borrada_en: string | null }>(
          s,
          'fotos',
          { select: 'id,ruta,ancho,alto,borrada_en', ...org, id: `eq.${fotoId}`, limit: '1' },
          f,
        )
      : Promise.resolve([]),
    seleccionar<FilaGeneracion>(s, 'generaciones', { select: SELECT_GEN, ...org, tanda_id: `eq.${id}`, estado: 'neq.estimada', order: 'creado_en.desc' }, f),
    rpc<number>(s, 'gasto_generaciones_mes', { p_org: ORGANIZACION_PILOTO_ID }, f),
  ])
  const creativos = gens.length
    ? await seleccionar<FilaCreativo>(
        s,
        'creativos',
        { select: SELECT_CREATIVO, ...org, generacion_id: `in.(${gens.map((g) => g.id).join(',')})`, order: 'creado_en.desc,orden.asc' },
        f,
      )
    : []

  const foto = fotos[0]
  const [urlsCreativos, urlsFoto, placas] = await Promise.all([
    firmar(s, BUCKET_CREATIVOS, creativos.flatMap((c) => (c.ruta ? [c.ruta] : [])), f),
    foto?.ruta ? firmar(s, BUCKET_FOTOS, [foto.ruta], f) : Promise.resolve(new Map<string, string>()),
    Promise.all(filas.map((h) => (h.placa_ruta ? firmarPlaca(s, h.placa_ruta, f) : null))),
  ])
  const urlFoto = foto?.ruta ? (urlsFoto.get(foto.ruta) ?? null) : null

  const ahoraMs = ahora()
  return {
    tanda: { id: tanda.id, creadoEn: tanda.creado_en },
    hijas: filas.map((h, i): HijaDeTanda => {
      const m = marcaPorId(h.marca_id) ?? MARCAS[0]!
      return {
        promocion: vistaDePromocion(h),
        marca: { id: m.id, nombre: m.nombre, usuarioIg: m.usuarioIg },
        miniatura: placas[i] ?? urlFoto,
        lista: estaLista(h),
      }
    }),
    resumen: {
      total: vivas.length,
      aprobadas: vivas.filter((h) => h.estado === 'aprobada').length,
      listas: vivas.filter(estaLista).length,
    },
    comparten: compartenEscena(borradores),
    foto: foto ? { id: foto.id, ancho: foto.ancho, alto: foto.alto, url: urlFoto, borrada: foto.borrada_en !== null } : null,
    escenas: gens.map((g) => ({
      generacion: vistaGeneracion(g, ahoraMs),
      creativos: creativos
        .filter((c) => c.generacion_id === g.id)
        .map((c) => ({ ...vistaCreativo(c, urlsCreativos), usadaEn: vivas.filter((h) => h.escena_creativo_id === c.id).length })),
    })),
    gastadoUsd: Math.round((Number(gasto) || 0) * 1e6) / 1e6,
  }
}
