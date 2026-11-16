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
import type { AspectoFoto } from '../productor/ediciones.ts'
import { componerPlaca, type PedidoPlaca } from './componer.ts'
import { idsDeRecursosDe } from './diseno/recursos-ids.ts'
import { leerManifiesto } from './logos-servidor.ts'
import { tonoDeReferencia } from './referencia/acento.ts'
import { leerPlantillaLista } from './referencia/cargar.ts'
import type { PlantillaReferencia } from './referencia/tipos.ts'
import { cargarRecursos, type RecursosCargados } from './recursos-placa.ts'
import { MENSAJE_REVISION, respuestaDeError } from './errores.ts'
import { marcaPorId } from './marca.ts'
import { ErrorTextoLargo, type TextosPlaca } from './plantillas.ts'
import { leerPromocion } from './repositorio.ts'
import { ocultosDeClasica, textosParaPlaca } from './textos-placa.ts'
import { escenaEsDe } from './tanda/escena.ts'
import { esPlantilla, esPlantillaDiseno, esPlantillaElegible, zonaDe, type FilaPromocion } from './tipos.ts'
import { verificacionVigente } from './copia/cargar.ts'
import { logoParaPegar } from './copia/logo.ts'
import { textosDeLaPromocion } from './copia/pedido.ts'
import { hashTextos } from './copia/textos.ts'
import { esCopiaFiel, type Caja01 } from './copia/tipos.ts'
import { zonaLogo } from './copia/zona-logo.ts'
import { vistaDePromocion } from './vista.ts'

type Entorno = Record<string, string | undefined>
type Fetch = typeof fetch
export type Componer = (p: PedidoPlaca) => Promise<Uint8Array>

export const BUCKET_CREATIVOS = 'creativos'
export const VIGENCIA_URL_PLACA_S = 3600
/** Cambiar cómo se dibuja la placa obliga a subir esta versión: una placa vieja nunca se reusa. */
/** v3: plantillas de diseño (el hash suma diseño, formato y recursos). */
export const VERSION_PLACA = 'placa-v5'

/** Lo que se escribe en la placa. El precio sale del dato cargado, nunca de un modelo. */
export function textosDePlaca(p: FilaPromocion): TextosPlaca {
  return textosParaPlaca({
    marca: marcaPorId(p.marca_id)?.nombre ?? '',
    modelo: p.modelo,
    datos: p.datos,
    titular: p.titular,
    titularDelTexto: p.copy?.titular ?? null,
    lineaExtra: p.linea_extra,
    // Solo las clásicas: en las de diseño los textos sacados los resuelve el propio diseño (que ya entra al hash).
    ...(ocultosDeClasica(p.plantilla, p.diseno) ? { ocultos: ocultosDeClasica(p.plantilla, p.diseno)! } : {}),
  })
}

/**
 * sha256 de TODO lo que se dibuja; el archivo se llama con sus primeros 12 caracteres.
 * `formato` (otro tamaño de la misma placa de diseño) y `shaRecursos` (los bytes de los logos y texturas) los
 * calcula quien llama: este hash sigue siendo puro.
 */
export function hashPlaca(p: FilaPromocion, o: { formato?: AspectoFoto; shaRecursos?: string; /** Solo la plantilla 'referencia': lo leído de la foto de inspiración. */ referencia?: PlantillaReferencia } = {}): { hash: string; hash12: string } {
  // La zona (no la posición de la moto a secas) es lo que cambia el dibujo: arriba/abajo no dependen de la moto.
  const zona = esPlantilla(p.plantilla) ? zonaDe(p.plantilla, p.posicion_moto) : null
  const base = { version: VERSION_PLACA, escena: p.escena_creativo_id, plantilla: p.plantilla, zona, aspecto: p.aspecto, textos: textosDePlaca(p) }
  // El diseño solo cuenta en una plantilla de diseño; la condición por defecto sale de la promo, así que también.
  const extra = esPlantillaDiseno(p.plantilla)
    ? {
        diseno: p.diseno ?? null,
        promo: p.datos.promo,
        formato: o.formato ?? p.aspecto,
        recursos: o.shaRecursos ?? null,
        // Solo la rama nueva suma la lectura: las placas de las otras plantillas conservan su hash (no se recomponen).
        ...(p.plantilla === 'referencia' ? { referencia: hashJson(o.referencia ?? null) } : {}),
      }
    : {}
  const hash = hashJson({ ...base, ...extra })
  return { hash, hash12: hash.slice(0, 12) }
}

/** El hash de la placa de la copia fiel (ADR-040): la imagen, el formato, los textos (hash del snapshot), el logo pegado (sus bytes) y su caja. */
export function hashPlacaCopia(p: { escenaId: string; formato: AspectoFoto; textosHash: string; logoSha: string | null; caja: Caja01 }): string {
  return hashJson({ version: 'placa-copia-v1', escena: p.escenaId, formato: p.formato, textosHash: p.textosHash, logoSha: p.logoSha, caja: p.caja })
}

/** Qué le falta a la promoción para poder armar la placa. */
export function faltantes(p: FilaPromocion): string[] {
  const falta: string[] = []
  if (!p.escena_creativo_id) falta.push('generar la imagen')
  if (!esPlantillaElegible(p.plantilla)) falta.push('elegir el diseño')
  if (!p.copy) falta.push('elegir el texto')
  return falta
}

export type PlacaLista = { ruta: string; hash: string; reutilizada: boolean }

const yaExiste = (e: unknown) => e instanceof ErrorSupabase && (e.status === 409 || /already exists|duplicate/i.test(e.message))

/**
 * La placa de la promoción tal como está ahora: la vigente si el hash coincide; si no, la
 * compone y la sube. NO toca la fila: quien llama la guarda (editar o aprobar).
 */
export async function obtenerPlaca(
  s: Supabase,
  promo: FilaPromocion,
  f: Fetch,
  componer: Componer,
  /** Otro tamaño de la misma placa de diseño (R6): no toca la fila ni la placa principal. `creativoId`: solo la copia fiel, la imagen ya generada de ese formato. */
  o: { formato?: AspectoFoto; creativoId?: string } = {},
): Promise<PlacaLista | Response> {
  const falta = faltantes(promo)
  if (falta.length > 0) return error(`Todavía falta ${falta.join(' y ')}.`, 422)

  // La copia fiel (ADR-040) es otra familia: la imagen YA trae los textos escritos por la IA; solo se arma con una verificación ok.
  if (esCopiaFiel(promo.plantilla)) return obtenerPlacaCopia(s, promo, f, componer, o)

  // La plantilla 'referencia' se dibuja con lo que se leyó de la foto de inspiración: sin una lectura LISTA no hay placa (ADR-039).
  let referencia: PlantillaReferencia | null = null
  if (promo.plantilla === 'referencia') {
    referencia = await leerPlantillaLista(s, promo.referencia_diseno_id ?? null, f)
    if (!referencia) return error('La lectura de tu referencia no está disponible: leela de nuevo en el paso 4.', 422)
  }

  // Las plantillas de diseño llevan logos y texturas: se leen acá para que sus bytes entren al hash.
  const cargados: RecursosCargados | null = esPlantillaDiseno(promo.plantilla)
    ? cargarRecursos(idsDeRecursosDe(leerManifiesto(), promo.marca_id, promo.plantilla, promo.diseno?.logoMarca ?? null, referencia ? tonoDeReferencia(referencia) : undefined))
    : null
  const { hash, hash12 } = hashPlaca(promo, { ...(o.formato ? { formato: o.formato } : {}), ...(cargados ? { shaRecursos: cargados.sha } : {}), ...(referencia ? { referencia } : {}) })
  if (promo.placa_hash === hash && promo.placa_ruta) return { ruta: promo.placa_ruta, hash, reutilizada: true }

  const [escena] = await seleccionar<{ id: string; ruta: string | null; mime_type: string | null; generaciones: { promocion_id: string | null; tanda_id: string | null; grupo: number | null } | null }>(
    s,
    'creativos',
    { select: 'id,ruta,mime_type,generaciones!generacion_id(promocion_id,tanda_id,grupo)', id: `eq.${promo.escena_creativo_id}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
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
      ...(cargados
        ? {
            formato: o.formato ?? promo.aspecto,
            diseno: promo.diseno,
            datos: promo.datos,
            recursos: cargados.recursos,
            nombreConcesionaria: marcaPorId(promo.marca_id)?.nombre ?? '',
            ...(referencia ? { referencia } : {}),
          }
        : {}),
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

async function obtenerPlacaCopia(
  s: Supabase,
  promo: FilaPromocion,
  f: Fetch,
  componer: Componer,
  o: { formato?: AspectoFoto; creativoId?: string },
): Promise<PlacaLista | Response> {
  const formato = o.formato ?? promo.aspecto
  const esExtra = formato !== promo.aspecto
  // El formato de la promoción usa su escena; otro formato es otra imagen (pagada aparte) que se indica por su id.
  const creativoId = esExtra ? (o.creativoId ?? null) : promo.escena_creativo_id
  if (creativoId === null) return responder({ error: 'Este formato todavía no se generó.', generar: true }, 422)

  const [creativo] = await seleccionar<{ id: string; ruta: string | null; mime_type: string | null; aspecto: string; generaciones: { promocion_id: string | null; tanda_id: string | null; grupo: number | null; textos_hash: string | null } | null }>(
    s,
    'creativos',
    { select: 'id,ruta,mime_type,aspecto,generaciones!generacion_id(promocion_id,tanda_id,grupo,textos_hash)', id: `eq.${creativoId}`, organizacion_id: `eq.${ORGANIZACION_PILOTO_ID}`, limit: '1' },
    f,
  )
  const noEsta = () => error('La imagen elegida ya no está disponible: generá otra.', 422)
  const gen = creativo?.generaciones ?? null
  if (!creativo || creativo.ruta === null || !gen) return noEsta()
  // La escena principal puede venir de una tanda; un formato extra es siempre de ESTA promoción.
  if (esExtra ? gen.promocion_id !== promo.id : !escenaEsDe(gen, promo)) return noEsta()
  if (creativo.aspecto !== formato) return error(esExtra ? 'Esa imagen no es de este formato.' : 'La imagen elegida no tiene el formato de la promoción: generá otra.', 422)

  // 1. Los textos de la promoción tienen que ser los que se le pidieron a la IA al generar (también lo que se sacó de la placa).
  const textos = textosDeLaPromocion(promo)
  if (gen.textos_hash === null || gen.textos_hash !== hashTextos(textos)) return error('Cambiaste los textos después de generar la imagen: generá otra.', 422)
  // 2. Y esa imagen tiene que tener una verificación ok contra ESOS textos.
  const v = await verificacionVigente(s, creativo.id, f)
  if (!v || v.estado !== 'ok' || v.textosHash !== gen.textos_hash) return error('Los textos de esta imagen no están verificados: elegí otra o generá de nuevo.', 422)

  // 3. El logo real (lo pega este renderer, no la IA) en la caja que vio el verificador.
  const logo = textos.logo === 'real' ? logoParaPegar(leerManifiesto(), promo.marca_id, v.fondoLogo) : null
  const cargado = logo ? cargarRecursos({ logo999: null, logoConcesionaria: logo.id, logoMarca: null, textura: null, raspado: null, placaClara: logo.placaClara }) : null
  const caja = zonaLogo(v.zonaLogo).caja
  const hash = hashPlacaCopia({ escenaId: creativo.id, formato, textosHash: gen.textos_hash, logoSha: cargado?.sha ?? null, caja })
  if (promo.placa_hash === hash && promo.placa_ruta) return { ruta: promo.placa_ruta, hash, reutilizada: true }

  let bytes: Uint8Array
  try {
    bytes = await descargarObjeto(s, BUCKET_CREATIVOS, creativo.ruta, f)
  } catch (e) {
    if (e instanceof ErrorSupabase && (e.status === 404 || e.status === 400)) return noEsta()
    throw e
  }
  if (bytes.length === 0) return noEsta()

  const png = await componer({
    escenaBytes: bytes,
    mime: creativo.mime_type ?? 'image/jpeg',
    textos: textosDePlaca(promo),
    plantilla: 'copia_fiel',
    posicionMoto: promo.posicion_moto,
    aspecto: promo.aspecto,
    copia: { formato, logo: cargado?.recursos.logoConcesionaria ?? null, placaClara: logo?.placaClara ?? false, caja },
  })
  const hash12 = hash.slice(0, 12)
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
