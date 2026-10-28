/**
 * POST /api/promociones/[id]/placa {revision}: compone la placa final y la deja en Storage.
 *
 * Es GRATIS y no pasa por la compuerta de costo: no llama a ningún modelo, solo
 * junta la escena que ya se pagó con el texto, determinísticamente (componer.ts). El
 * PNG puede pasar los 4,5 MB que admite una respuesta de Vercel, así que no se
 * devuelve: se sube al bucket privado `creativos` y se responde una URL firmada.
 *
 * El nombre del archivo lleva un hash de todo lo que se dibuja: si no cambió nada
 * se reusa, y si ya existe en Storage (409) es el mismo contenido y se sigue.
 */

import { autorizarMiembro } from '../agentes/autorizar.ts'
import { hashJson } from '../agentes/hash.ts'
import { error, responder, UUID } from '../agentes/http.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import { ErrorSupabase, rpc, seleccionar, type Supabase } from '../supabase/rest.ts'
import { descargarObjeto, firmarUrls, subirObjeto } from '../supabase/storage.ts'
import { componerPlaca, type PedidoPlaca } from './componer.ts'
import { MENSAJE_REVISION, respuestaDeError } from './errores.ts'
import { marcaPorId } from './marca.ts'
import { ErrorTextoLargo, type TextosPlaca } from './plantillas.ts'
import { leerPromocion } from './repositorio.ts'
import { textosParaPlaca } from './textos-placa.ts'
import { escenaEsDe } from './tanda/escena.ts'
import { esPlantilla, zonaDe, type FilaPromocion } from './tipos.ts'
import { vistaDePromocion } from './vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch
export type Componer = (p: PedidoPlaca) => Promise<Uint8Array>

export const BUCKET_CREATIVOS = 'creativos'
export const VIGENCIA_URL_PLACA_S = 3600
/** Cambiar cómo se dibuja la placa obliga a subir esta versión: una placa vieja nunca se reusa. */
export const VERSION_PLACA = 'placa-v2'

/** Lo que se escribe en la placa. El precio sale del dato cargado, nunca de un modelo. */
export function textosDePlaca(p: FilaPromocion): TextosPlaca {
  return textosParaPlaca({
    marca: marcaPorId(p.marca_id)?.nombre ?? '',
    modelo: p.modelo,
    datos: p.datos,
    titular: p.titular,
    titularDelTexto: p.copy?.titular ?? null,
    lineaExtra: p.linea_extra,
  })
}

/** sha256 de TODO lo que se dibuja; el archivo se llama con sus primeros 12 caracteres. */
export function hashPlaca(p: FilaPromocion): { hash: string; hash12: string } {
  // La zona (no la posición de la moto a secas) es lo que cambia el dibujo: arriba/abajo no dependen de la moto.
  const zona = esPlantilla(p.plantilla) ? zonaDe(p.plantilla, p.posicion_moto) : null
  const hash = hashJson({ version: VERSION_PLACA, escena: p.escena_creativo_id, plantilla: p.plantilla, zona, aspecto: p.aspecto, textos: textosDePlaca(p) })
  return { hash, hash12: hash.slice(0, 12) }
}

/** Qué le falta a la promoción para poder armar la placa. */
export function faltantes(p: FilaPromocion): string[] {
  const falta: string[] = []
  if (!p.escena_creativo_id) falta.push('generar la imagen')
  if (!esPlantilla(p.plantilla)) falta.push('elegir el diseño')
  if (!p.copy) falta.push('elegir el texto')
  return falta
}

export type PlacaLista = { ruta: string; hash: string; reutilizada: boolean }

const yaExiste = (e: unknown) => e instanceof ErrorSupabase && (e.status === 409 || /already exists|duplicate/i.test(e.message))

/**
 * La placa de la promoción tal como está ahora: la vigente si el hash coincide; si no, la
 * compone y la sube. NO toca la fila: quien llama la guarda (editar o aprobar).
 */
export async function obtenerPlaca(s: Supabase, promo: FilaPromocion, f: Fetch, componer: Componer): Promise<PlacaLista | Response> {
  const falta = faltantes(promo)
  if (falta.length > 0) return error(`Todavía falta ${falta.join(' y ')}.`, 422)

  const { hash, hash12 } = hashPlaca(promo)
  if (promo.placa_hash === hash && promo.placa_ruta) return { ruta: promo.placa_ruta, hash, reutilizada: true }

  const [escena] = await seleccionar<{ id: string; ruta: string | null; mime_type: string | null; generaciones: { promocion_id: string | null; tanda_id: string | null; grupo: number | null } | null }>(
    s,
    'creativos',
    { select: 'id,ruta,mime_type,generaciones(promocion_id,tanda_id,grupo)', id: `eq.${promo.escena_creativo_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  const noEsta = () => error('La imagen elegida ya no está disponible: generá otra.', 422)
  if (!escena || escena.ruta === null || !escenaEsDe(escena.generaciones, promo)) return noEsta()

  let bytes: Uint8Array
  try {
    bytes = await descargarObjeto(s, BUCKET_CREATIVOS, escena.ruta, f)
  } catch (e) {
    if (e instanceof ErrorSupabase && (e.status === 404 || e.status === 400)) return noEsta()
    throw e
  }
  if (bytes.length === 0) return noEsta()

  let png: Uint8Array
  try {
    png = await componer({
      escenaBytes: bytes,
      mime: escena.mime_type ?? 'image/jpeg',
      textos: textosDePlaca(promo),
      plantilla: promo.plantilla as PedidoPlaca['plantilla'],
      posicionMoto: promo.posicion_moto,
      aspecto: promo.aspecto,
    })
  } catch (e) {
    if (e instanceof ErrorTextoLargo) return error(e.message, 422)
    throw e
  }

  const ruta = `${ORGANIZACION_PILOTO_ID}/promociones/${promo.id}/${hash12}.png`
  try {
    await subirObjeto(s, BUCKET_CREATIVOS, ruta, png, 'image/png', f)
  } catch (e) {
    // Ya estaba (mismo hash = mismo contenido): no es un error.
    if (!yaExiste(e)) throw e
  }
  return { ruta, hash, reutilizada: false }
}

/** URL firmada de una placa, o null si no se pudo firmar (la placa igual quedó guardada). */
export async function firmarPlaca(s: Supabase, ruta: string, f: Fetch, descarga?: string): Promise<string | null> {
  try {
    return (await firmarUrls(s, BUCKET_CREATIVOS, [ruta], VIGENCIA_URL_PLACA_S, f, descarga ? { descarga } : {})).get(ruta) ?? null
  } catch (e) {
    console.error('promociones: no se pudo firmar la placa', e instanceof ErrorSupabase ? e.message : 'error interno')
    return null
  }
}

export async function manejarPlaca(request: Request, id: string, entorno: Entorno, f: Fetch, componer: Componer = componerPlaca): Promise<Response> {
  const ctx = await autorizarMiembro(request, entorno, 'armar la imagen final', f)
  if (ctx instanceof Response) return ctx
  const { usuarioId, supabase } = ctx

  if (!UUID.test(id)) return error('No se encontró la promoción.', 404)
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const revision = cuerpo?.revision
  if (cuerpo === null || typeof cuerpo !== 'object' || typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return error('Falta la revisión de la promoción que estás viendo.', 400)
  }

  try {
    const promo = await leerPromocion(supabase, id, f)
    if (!promo) return error('No se encontró la promoción.', 404)
    if (promo.estado !== 'borrador') return error('Esta promoción ya no es un borrador.', 409)
    if (promo.revision !== revision) return error(MENSAJE_REVISION, 409)

    const placa = await obtenerPlaca(supabase, promo, f, componer)
    if (placa instanceof Response) return placa

    // Reusada: no hay nada que guardar. Nueva: queda en la promoción con la revisión que se veía.
    const actual = placa.reutilizada
      ? promo
      : await rpc<FilaPromocion>(
          supabase,
          'editar_promocion',
          { p_id: id, p_revision: revision, p_campos: { placa_ruta: placa.ruta, placa_hash: placa.hash }, p_usuario: usuarioId },
          f,
        )
    return responder(
      { url: await firmarPlaca(supabase, placa.ruta, f), hash: placa.hash, reutilizada: placa.reutilizada, promocion: vistaDePromocion(actual) },
      200,
    )
  } catch (e) {
    return respuestaDeError(e, 'la imagen final')
  }
}
