/**
 * Composición de la placa final: la escena de Gemini + el texto, determinísticamente,
 * con next/og (satori + resvg). Gratis y sin compuerta de costo: no llama a ningún
 * modelo ni a la red. El precio sale del dato cargado, jamás de la IA.
 *
 * El render se inyecta (como el `fetch` en el resto de lib/) para testear todo lo
 * demás sin dibujar; `renderSatori` es el real y carga `next/og` recién cuando se usa.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { Placa } from '@/components/promocion/placa'
import type { RecursosPlaca } from '@/components/promocion/placas/tipos'
import type { AspectoFoto } from '../productor/ediciones.ts'
import type { Diseno } from './diseno/tipos.ts'
import { prepararDiseno } from './diseno/preparar.ts'
import { fuentesDe, REGISTRO_FUENTES, type FuenteRegistrada, type IdFuente } from './fuentes-placa.ts'
import { ajustarTextos, FUENTES, medidasDe, type TextosPlaca } from './plantillas.ts'
import { esPlantillaDiseno, type DatosPromocion, type IdPlantilla, type PosicionMoto } from './tipos.ts'

export type PedidoPlaca = {
  escenaBytes: Uint8Array
  /** Tipo de la escena ("image/jpeg"): entra al data URI. */
  mime: string
  textos: TextosPlaca
  plantilla: IdPlantilla
  /** Al costado, define de qué lado va el texto (el opuesto a la moto). */
  posicionMoto: PosicionMoto
  aspecto: AspectoFoto
  /** Solo plantillas de diseño: el tamaño en que se dibuja (la escena se re-encuadra). Sin él, el aspecto de la promoción. */
  formato?: AspectoFoto
  /** Solo plantillas de diseño: lo guardado en promociones.diseno (null = defaults). */
  diseno?: Diseno | null
  /** Solo plantillas de diseño: de acá sale la condición por defecto. */
  datos?: DatosPromocion
  /** Solo plantillas de diseño: logos y texturas como data URIs. */
  recursos?: RecursosPlaca
  /** Solo plantillas de diseño: se escribe en texto si la concesionaria no tiene logo. */
  nombreConcesionaria?: string
}

/** El tercer argumento son las fuentes que hay que registrar (solo las de la plantilla). */
export type Render = (arbol: ReactElement, medidas: { width: number; height: number }, fuentes: readonly IdFuente[]) => Promise<Uint8Array>

type Fuente = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: 'normal' | 'italic' }

/** Se leen una sola vez por archivo y por instancia del servidor. Los archivos viajan en el deploy (next.config: outputFileTracingIncludes). */
const cacheFuentes = new Map<string, Promise<Fuente>>()
function cargarFuente(f: FuenteRegistrada): Promise<Fuente> {
  let p = cacheFuentes.get(f.archivo)
  if (!p) {
    p = readFile(join(process.cwd(), 'assets/fuentes', f.archivo)).then((bytes) => ({
      name: f.familia,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      weight: f.peso,
      style: f.estilo,
    }))
    cacheFuentes.set(f.archivo, p)
    p.catch(() => cacheFuentes.delete(f.archivo))
  }
  return p
}

export const renderSatori: Render = async (arbol, { width, height }, ids) => {
  const { ImageResponse } = await import('next/og')
  const fonts = await Promise.all(ids.map((id) => cargarFuente(REGISTRO_FUENTES[id])))
  const respuesta = new ImageResponse(arbol, { width, height, fonts })
  return new Uint8Array(await respuesta.arrayBuffer())
}

const SIN_RECURSOS: RecursosPlaca = { logo999: null, logoConcesionaria: null, logoMarca: null, textura: null, raspado: null }

/** Devuelve los bytes del PNG. Lanza ErrorTextoLargo si algún texto no entra en el diseño. */
export async function componerPlaca(p: PedidoPlaca, render: Render = renderSatori): Promise<Uint8Array> {
  const escenaSrc = `data:${p.mime};base64,${Buffer.from(p.escenaBytes).toString('base64')}`
  if (esPlantillaDiseno(p.plantilla)) {
    if (!p.datos) throw new Error('Una plantilla de diseño necesita los datos de la promoción.')
    // Antes de dibujar: si un texto no entra, ErrorTextoLargo sale sin gastar el render.
    const prep = prepararDiseno({ plantilla: p.plantilla, formato: p.formato ?? p.aspecto, textos: p.textos, guardado: p.diseno ?? null, datos: p.datos })
    const ids = fuentesDe(p.plantilla)
    const familias = Object.fromEntries((Object.keys(REGISTRO_FUENTES) as IdFuente[]).map((id) => [id, REGISTRO_FUENTES[id].familia])) as Record<IdFuente, string>
    const arbol = Placa({
      plantilla: p.plantilla,
      escenaSrc,
      textos: p.textos,
      diseno: prep.diseno,
      layout: prep.layout,
      ajuste: prep.ajuste,
      recursos: p.recursos ?? SIN_RECURSOS,
      familias,
      nombreConcesionaria: p.nombreConcesionaria ?? p.textos.marca,
    })
    return render(arbol, { width: prep.layout.ancho, height: prep.layout.alto }, ids)
  }
  // Antes de dibujar: si un texto no entra, se avisa sin gastar el render.
  const ajuste = ajustarTextos(p.textos, p.plantilla, p.aspecto, p.posicionMoto)
  const { ancho, alto } = medidasDe(p.aspecto)
  // Placa es una función pura (sin hooks): se llama directo y satori recibe elementos de HTML.
  const arbol = Placa({
    escenaSrc,
    textos: p.textos,
    plantilla: p.plantilla,
    posicionMoto: p.posicionMoto,
    aspecto: p.aspecto,
    ajuste,
    fuentes: { titulo: FUENTES.titulo.nombre, texto: FUENTES.texto.nombre },
  })
  return render(arbol, { width: ancho, height: alto }, fuentesDe(p.plantilla))
}
