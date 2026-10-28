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
import { gruposDeTanda } from '../lote/grupos.ts'
import { esTipoTanda, type TipoTanda } from '../lote/tipos.ts'
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

type FotoTanda = { id: string; ancho: number; alto: number; url: string | null; borrada: boolean }
export type EscenaDeTanda = { generacion: GeneracionVista; creativos: (CreativoVista & { usadaEn: number })[] }

/** Una moto de un lote (o el único grupo de una tanda de marcas o de textos): su foto, sus hijas y sus escenas. */
export type GrupoDeTandaVista = {
  grupo: number | null
  modelo: string
  hijaIds: string[]
  foto: FotoTanda | null
  /** ¿Las hijas en borrador DE ESTA MOTO piden la misma escena? */
  comparten: ResultadoEscena
  escenas: EscenaDeTanda[]
}

/** Una imagen de un lote que se pagó (confirmada) pero todavía no terminó: generarla o liberarla. */
export type PendienteDeLote = {
  generacionId: string
  /** El lote al que pertenece (para liberarlo). */
  loteId: string
  grupo: number | null
  modelo: string
  estado: 'confirmada' | 'corriendo'
  /** Hace más de 10 minutos que quedó así: la función murió a mitad. */
  interrumpida: boolean
  costoEstimadoUsd: number
}

export type TandaVista = {
  tanda: { id: string; creadoEn: string }
  tipo: TipoTanda
  hijas: HijaDeTanda[]
  /** Un grupo por moto en un lote de motos; en las demás tandas, uno solo. */
  grupos: GrupoDeTandaVista[]
  pendientes: PendienteDeLote[]
  /** Las hijas vivas (no descartadas): lo que cuenta la pantalla. */
  resumen: { total: number; aprobadas: number; listas: number }
  /** ¿Las hijas en borrador (de cada moto) piden la misma escena? Si no, qué difiere. */
  comparten: ResultadoEscena
  /** La foto de la primera moto. */
  foto: FotoTanda | null
  /** La foto de inspiración compartida (la de la primera hija viva), si la hay. */
  inspiracion: { id: string; url: string | null; borrada: boolean } | null
  escenas: EscenaDeTanda[]
  gastadoUsd: number
}

/** Texto, imagen y diseño elegidos: lo que pide aprobar_promocion (más la placa, que se compone al aprobar). */
const estaLista = (h: FilaPromocion): boolean => h.estado === 'borrador' && h.copy !== null && h.escena_creativo_id !== null && h.plantilla !== null

/** Lo que la pantalla necesita de cada generación: grupo y lote, además de lo común. */
const SELECT_GEN_TANDA = `${SELECT_GEN},grupo,lote_id`

const ordenMarcas = (id: string) => MARCAS.findIndex((m) => m.id === id)

/** En un lote todas las hijas nacen juntas (mismo creado_en): se ordenan por moto, texto y orden de las marcas. */
const porPieza = (a: FilaPromocion, b: FilaPromocion) =>
  (a.grupo ?? 0) - (b.grupo ?? 0) || (a.variante ?? 0) - (b.variante ?? 0) || ordenMarcas(a.marca_id) - ordenMarcas(b.marca_id)

/** Junta lo que difiere en cada moto, sin repetir y en el orden en que aparece. */
function unirComparten(rs: readonly ResultadoEscena[]): ResultadoEscena {
  const difieren = [...new Set(rs.flatMap((r) => (r.ok ? [] : r.difieren)))]
  return difieren.length === 0 ? { ok: true } : { ok: false, difieren }
}

export async function leerTanda(s: Supabase, id: string, f: Fetch, ahora: () => number = Date.now): Promise<TandaVista | null> {
  if (!UUID.test(id)) return null
  const org = { organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}` }
  const [tandas, leidas] = await Promise.all([
    seleccionar<{ id: string; creado_en: string; tipo?: string }>(s, 'tandas_promocion', { select: 'id,creado_en,tipo', ...org, id: `eq.${id}`, limit: '1' }, f),
    seleccionar<FilaPromocion>(
      s,
      'promociones',
      { select: COLUMNAS_PROMOCION, ...org, tanda_id: `eq.${id}`, order: 'creado_en.asc,id.asc' },
      f,
    ),
  ])
  const tanda = tandas[0]
  if (!tanda) return null
  // Las tandas anteriores a los lotes no tienen tipo: son de marcas.
  const tipo: TipoTanda = esTipoTanda(tanda.tipo) ? tanda.tipo : 'marcas'
  const filas = tipo === 'marcas' ? leidas : [...leidas].sort(porPieza)

  const vivas = filas.filter((h) => h.estado !== 'descartada')
  const borradores = filas.filter((h) => h.estado === 'borrador')
  const inspiracionId = (vivas[0] ?? filas[0])?.inspiracion_foto_id ?? null
  // Una foto por moto (en un lote de motos) más la de inspiración.
  const fotoIds = [...new Set([...(vivas.length > 0 ? vivas : filas).map((h) => h.foto_id), inspiracionId].filter((x): x is string => x !== null))]
  const fotoId = (vivas[0] ?? filas[0])?.foto_id

  const [fotos, gens, gasto] = await Promise.all([
    fotoIds.length > 0
      ? seleccionar<{ id: string; ruta: string | null; ancho: number; alto: number; borrada_en: string | null }>(
          s,
          'fotos',
          { select: 'id,ruta,ancho,alto,borrada_en', ...org, id: `in.(${fotoIds.join(',')})` },
          f,
        )
      : Promise.resolve([]),
    seleccionar<FilaGeneracion>(s, 'generaciones', { select: SELECT_GEN_TANDA, ...org, tanda_id: `eq.${id}`, estado: 'neq.estimada', order: 'creado_en.desc' }, f),
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

  const inspiracion = fotos.find((x) => x.id === inspiracionId)
  const [urlsCreativos, urlsFoto, placas] = await Promise.all([
    firmar(s, BUCKET_CREATIVOS, creativos.flatMap((c) => (c.ruta ? [c.ruta] : [])), f),
    firmar(s, BUCKET_FOTOS, fotos.flatMap((x) => (x.ruta ? [x.ruta] : [])), f),
    Promise.all(filas.map((h) => (h.placa_ruta ? firmarPlaca(s, h.placa_ruta, f) : null))),
  ])
  const vistaFoto = (id: string | undefined): FotoTanda | null => {
    const x = fotos.find((o) => o.id === id)
    return x ? { id: x.id, ancho: x.ancho, alto: x.alto, url: x.ruta ? (urlsFoto.get(x.ruta) ?? null) : null, borrada: x.borrada_en !== null } : null
  }
  const foto = vistaFoto(fotoId)
  const urlFoto = foto?.url ?? null

  const ahoraMs = ahora()
  const escenaVista = (g: FilaGeneracion): EscenaDeTanda => ({
    generacion: vistaGeneracion(g, ahoraMs),
    creativos: creativos
      .filter((c) => c.generacion_id === g.id)
      .map((c) => ({ ...vistaCreativo(c, urlsCreativos), usadaEn: vivas.filter((h) => (h.grupo ?? null) === (g.grupo ?? null) && h.escena_creativo_id === c.id).length })),
  })
  const grupos = gruposDeTanda(filas).map((g): GrupoDeTandaVista => {
    const vivasDelGrupo = g.hijas.filter((h) => h.estado !== 'descartada')
    return {
      grupo: g.grupo,
      modelo: g.modelo,
      hijaIds: g.hijas.map((h) => h.id),
      foto: vistaFoto((vivasDelGrupo[0] ?? g.hijas[0])?.foto_id),
      comparten: compartenEscena(g.hijas.filter((h) => h.estado === 'borrador')),
      escenas: gens.filter((x) => (x.grupo ?? null) === g.grupo).map(escenaVista),
    }
  })
  const modeloDe = (grupo: number | null) => grupos.find((g) => g.grupo === grupo)?.modelo ?? filas[0]?.modelo ?? ''

  return {
    tanda: { id: tanda.id, creadoEn: tanda.creado_en },
    tipo,
    hijas: filas.map((h, i): HijaDeTanda => {
      const m = marcaPorId(h.marca_id) ?? MARCAS[0]!
      return {
        promocion: vistaDePromocion(h),
        marca: { id: m.id, nombre: m.nombre, usuarioIg: m.usuarioIg },
        miniatura: placas[i] ?? vistaFoto(h.foto_id)?.url ?? urlFoto,
        lista: estaLista(h),
      }
    }),
    grupos,
    pendientes: gens
      .filter((g) => g.lote_id && (g.estado === 'confirmada' || g.estado === 'corriendo'))
      .map((g) => ({
        generacionId: g.id,
        loteId: g.lote_id!,
        grupo: g.grupo ?? null,
        modelo: modeloDe(g.grupo ?? null),
        estado: g.estado as 'confirmada' | 'corriendo',
        interrumpida: vistaGeneracion(g, ahoraMs).interrumpida,
        costoEstimadoUsd: Number(g.costo_estimado_usd),
      })),
    resumen: {
      total: vivas.length,
      aprobadas: vivas.filter((h) => h.estado === 'aprobada').length,
      listas: vivas.filter(estaLista).length,
    },
    comparten: unirComparten(grupos.map((g) => g.comparten)),
    foto,
    inspiracion: inspiracion ? { id: inspiracion.id, borrada: inspiracion.borrada_en !== null, url: inspiracion.ruta ? (urlsFoto.get(inspiracion.ruta) ?? null) : null } : null,
    escenas: gens.map(escenaVista),
    gastadoUsd: Math.round((Number(gasto) || 0) * 1e6) / 1e6,
  }
}
