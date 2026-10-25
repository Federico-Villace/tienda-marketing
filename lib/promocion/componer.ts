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
import type { AspectoFoto } from '../productor/ediciones.ts'
import { ajustarTextos, FUENTES, medidasDe, type TextosPlaca } from './plantillas.ts'
import type { IdPlantilla } from './tipos.ts'

export type PedidoPlaca = {
  escenaBytes: Uint8Array
  /** Tipo de la escena ("image/jpeg"): entra al data URI. */
  mime: string
  textos: TextosPlaca
  plantilla: IdPlantilla
  aspecto: AspectoFoto
}

export type Render = (arbol: ReactElement, medidas: { width: number; height: number }) => Promise<Uint8Array>

type Fuente = { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }

/** Se leen una sola vez por instancia del servidor. El archivo viaja en el deploy (next.config: outputFileTracingIncludes). */
let fuentes: Promise<Fuente[]> | null = null
function cargarFuentes(): Promise<Fuente[]> {
  fuentes ??= Promise.all(
    [FUENTES.titulo, FUENTES.texto].map(async (f) => {
      const bytes = await readFile(join(process.cwd(), 'assets/fuentes', f.archivo))
      return { name: f.nombre, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, weight: f.peso, style: 'normal' as const }
    }),
  ).catch((e) => {
    fuentes = null
    throw e
  })
  return fuentes
}

export const renderSatori: Render = async (arbol, { width, height }) => {
  const { ImageResponse } = await import('next/og')
  const respuesta = new ImageResponse(arbol, { width, height, fonts: await cargarFuentes() })
  return new Uint8Array(await respuesta.arrayBuffer())
}

/** Devuelve los bytes del PNG. Lanza ErrorTextoLargo si algún texto no entra en el diseño. */
export async function componerPlaca(p: PedidoPlaca, render: Render = renderSatori): Promise<Uint8Array> {
  // Antes de dibujar: si un texto no entra, se avisa sin gastar el render.
  const ajuste = ajustarTextos(p.textos, p.plantilla, p.aspecto)
  const { ancho, alto } = medidasDe(p.aspecto)
  // Placa es una función pura (sin hooks): se llama directo y satori recibe elementos de HTML.
  const arbol = Placa({
    escenaSrc: `data:${p.mime};base64,${Buffer.from(p.escenaBytes).toString('base64')}`,
    textos: p.textos,
    plantilla: p.plantilla,
    aspecto: p.aspecto,
    ajuste,
    fuentes: { titulo: FUENTES.titulo.nombre, texto: FUENTES.texto.nombre },
  })
  return render(arbol, { width: ancho, height: alto })
}
