/**
 * La placa de una promoción: la foto editada de fondo y, encima, el texto que se lee.
 * El precio y todo lo demás lo escribe ESTE componente, determinísticamente; la IA solo
 * hizo la escena.
 *
 * Es el MISMO componente en el navegador (vista previa en vivo, gratis) y en el servidor
 * (PNG final con next/og / satori), por eso:
 *   · solo estilos inline y solo `display: flex` (satori no entiende clases ni grillas);
 *   · sin hooks ni estado, y sin 'use client': lo importan los dos lados.
 * Los tamaños de letra ya vienen calculados (lib/promocion/plantillas.ts).
 */

import type { CSSProperties } from 'react'
import { esLateral, layoutDe, ORDEN, PLANTILLAS, type AjusteTextos, type Campo, type TextosPlaca } from '@/lib/promocion/plantillas'
import type { AspectoFoto } from '@/lib/productor/ediciones'
import type { IdPlantilla, PosicionMoto } from '@/lib/promocion/tipos'

export type FuentesPlaca = { titulo: string; texto: string }

export type PropsPlaca = {
  /** URL o data URI de la escena. */
  escenaSrc: string
  textos: TextosPlaca
  plantilla: IdPlantilla
  /** Al costado, el texto va del lado opuesto a la moto. */
  posicionMoto?: PosicionMoto
  aspecto: AspectoFoto
  ajuste: AjusteTextos
  /** Nombres de familia: en el servidor 'Anton' / 'Inter'; en el navegador, los de next/font. */
  fuentes: FuentesPlaca
}

const OSCURO = '10, 12, 16'
const ACENTO = '#FACC15'

const estiloDe = (campo: Campo, tam: number, fuentes: FuentesPlaca): CSSProperties => {
  const base: CSSProperties = { display: 'flex', fontSize: tam, color: '#FFFFFF' }
  switch (campo) {
    case 'marca':
      return { ...base, fontFamily: fuentes.texto, fontWeight: 600, color: '#E5E7EB', textTransform: 'uppercase', letterSpacing: 3, lineHeight: 1.25 }
    case 'modelo':
      return { ...base, fontFamily: fuentes.titulo, fontWeight: 400, lineHeight: 1.15, textTransform: 'uppercase' }
    case 'precio':
      return { ...base, fontFamily: fuentes.titulo, fontWeight: 400, color: ACENTO, lineHeight: 1.15 }
    case 'promo':
      return { ...base, fontFamily: fuentes.texto, fontWeight: 600, lineHeight: 1.25 }
    case 'titular':
      return { ...base, fontFamily: fuentes.texto, fontWeight: 600, color: '#E5E7EB', lineHeight: 1.25 }
    case 'extra':
      return { ...base, fontFamily: fuentes.texto, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, lineHeight: 1.25 }
    case 'lugar':
      return { ...base, fontFamily: fuentes.texto, fontWeight: 600, color: '#D1D5DB', lineHeight: 1.25 }
  }
}

export function Placa({ escenaSrc, textos, plantilla, posicionMoto = 'centro', aspecto, ajuste, fuentes }: PropsPlaca) {
  const l = layoutDe(plantilla, aspecto, posicionMoto)
  const lateral = esLateral(l.zona)
  const solido = PLANTILLAS[plantilla].estilo === 'solido'
  const campos = ORDEN.filter((campo) => ajuste[campo].lineas > 0).map((campo, i) => (
    <div key={campo} style={{ ...estiloDe(campo, ajuste[campo].tam, fuentes), ...(i > 0 ? { marginTop: ajuste.separacion } : {}) }}>
      {textos[campo].trim()}
    </div>
  ))

  const imagen = (
    <img
      src={escenaSrc}
      alt=""
      width={l.ancho}
      height={l.alto}
      style={{ position: 'absolute', top: 0, left: 0, width: l.ancho, height: l.alto, objectFit: 'cover' }}
    />
  )
  const marco: CSSProperties = { display: 'flex', position: 'relative', width: l.ancho, height: l.alto, backgroundColor: `rgb(${OSCURO})`, overflow: 'hidden' }

  if (lateral) {
    // El texto ocupa una mitad, de arriba a abajo; la otra mitad es de la moto.
    const izquierda = l.zona === 'izquierda'
    const lado: CSSProperties = izquierda ? { left: 0 } : { right: 0 }
    // El fondo del texto SIEMPRE es oscuro y casi opaco: la legibilidad no depende de que la IA haya respetado la zona libre.
    const fondo: CSSProperties = solido
      ? { width: l.bandaAncho, backgroundColor: `rgba(${OSCURO}, 0.96)`, ...(izquierda ? { borderRight: `8px solid ${ACENTO}` } : { borderLeft: `8px solid ${ACENTO}` }) }
      : {
          width: l.bandaAncho + l.fundido,
          backgroundImage: `linear-gradient(${izquierda ? 'to right' : 'to left'}, rgba(${OSCURO}, 0.96) 0%, rgba(${OSCURO}, 0.9) 70%, rgba(${OSCURO}, 0) 100%)`,
        }
    return (
      <div style={marco}>
        {imagen}
        <div style={{ display: 'flex', position: 'absolute', top: 0, height: l.alto, ...lado, ...fondo }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: 0,
            width: l.bandaAncho,
            height: l.alto,
            padding: `${l.padY}px ${l.padX}px`,
            justifyContent: 'center',
            ...lado,
          }}
        >
          {campos}
        </div>
      </div>
    )
  }

  const abajo = l.zona === 'abajo'
  // Pegado al borde de la zona: abajo usa `bottom`, arriba usa `top`.
  const borde: CSSProperties = abajo ? { bottom: 0 } : { top: 0 }
  const fondo: CSSProperties = solido
    ? {
        height: l.bandaAlto,
        backgroundColor: `rgba(${OSCURO}, 0.96)`,
        ...(abajo ? { borderTop: `8px solid ${ACENTO}` } : { borderBottom: `8px solid ${ACENTO}` }),
      }
    : {
        height: l.bandaAlto + l.fundido,
        backgroundImage: `linear-gradient(${abajo ? 'to bottom' : 'to top'}, rgba(${OSCURO}, 0) 0%, rgba(${OSCURO}, 0.9) 38%, rgba(${OSCURO}, 0.96) 100%)`,
      }

  return (
    <div style={marco}>
      {imagen}
      <div style={{ display: 'flex', position: 'absolute', left: 0, width: l.ancho, ...borde, ...fondo }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 0,
          width: l.ancho,
          height: l.bandaAlto,
          padding: `${l.padY}px ${l.padX}px`,
          justifyContent: abajo ? 'flex-end' : 'flex-start',
          ...borde,
        }}
      >
        {campos}
      </div>
    </div>
  )
}
