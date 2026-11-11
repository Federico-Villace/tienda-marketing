/**
 * Piezas que comparten las plantillas de diseño. Mismas reglas que <Placa>: puro, sin hooks, solo estilos
 * inline y `display: flex`, porque el MISMO árbol lo dibujan el navegador y satori.
 */

import type { CSSProperties, ReactNode } from 'react'
import type { Caja } from '@/lib/promocion/diseno/layouts'
import type { PropsPlacaDiseno } from './tipos'

/** Posición absoluta de una caja del layout. */
export const enCaja = (c: Caja, extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, ...extra })

/** El lienzo: tamaño exacto del formato y todo lo que se sale, recortado. */
export const lienzo = (p: Pick<PropsPlacaDiseno, 'layout'>, fondo: string): CSSProperties => ({
  display: 'flex',
  position: 'relative',
  width: p.layout.ancho,
  height: p.layout.alto,
  backgroundColor: fondo,
  overflow: 'hidden',
})

/** Una imagen que ocupa un rectángulo entero (textura, escena). */
export function ImagenCompleta({ src, caja, ajuste = 'cover' }: { src: string; caja: Caja; ajuste?: 'cover' | 'contain' | 'fill' }) {
  return <img src={src} alt="" width={caja.w} height={caja.h} style={{ position: 'absolute', left: caja.x, top: caja.y, width: caja.w, height: caja.h, objectFit: ajuste }} />
}

/**
 * La máscara con que la escena se funde con el fondo: UNA imagen SVG cuyo alfa es (degradé horizontal × degradé vertical), así
 * los CUATRO bordes quedan transparentes. Dos `mask-image` anidados no sirven: satori aplica solo uno (probado), y en el
 * navegador sí se multiplicarían, o sea que se verían distinto. Con una sola máscara los dos dibujan lo mismo.
 */
export function mascaraEscena(w: number, h: number, lados: number, arriba: number, abajo: number): string {
  const f = (n: number) => String(Math.round(n * 1000) / 1000)
  const degrade = (id: string, x2: number, y2: number, ini: number, fin: number) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${f(ini)}" stop-color="#fff"/><stop offset="${f(1 - fin)}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs>` +
    `${degrade('h', 1, 0, lados, lados)}${degrade('v', 0, 1, arriba, abajo)}` +
    `<mask id="m"><rect width="${w}" height="${h}" fill="url(#v)"/></mask></defs><rect width="${w}" height="${h}" fill="url(#h)" mask="url(#m)"/></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/**
 * La escena (la moto con su estudio de fondo) fundida con el fondo de la plantilla: los CUATRO bordes se vuelven transparentes,
 * así que no queda ningún rectángulo con filo.
 */
export function EscenaFundida({ src, caja, lados = 0.08, arriba = 0.16, abajo = 0.16 }: { src: string; caja: Caja; lados?: number; arriba?: number; abajo?: number }) {
  return (
    <div style={enCaja(caja, { maskImage: mascaraEscena(caja.w, caja.h, lados, arriba, abajo), maskSize: `${caja.w}px ${caja.h}px` })}>
      <img src={src} alt="" width={caja.w} height={caja.h} style={{ width: caja.w, height: caja.h, objectFit: 'cover' }} />
    </div>
  )
}

/** Un logo tal cual (sin pasarlo por ningún filtro), centrado en su caja. */
export function Logo({ src, caja }: { src: string; caja: Caja }) {
  return (
    <div style={enCaja(caja, { alignItems: 'center', justifyContent: 'center' })}>
      <img src={src} alt="" style={{ maxWidth: caja.w, maxHeight: caja.h, objectFit: 'contain' }} />
    </div>
  )
}

/** "999motos", "999 Motos", "999-MOTOS"…: el nombre que ya está dibujado arriba como logo 999. */
export const esNombre999 = (nombre: string): boolean => nombre.toLowerCase().replace(/[^a-z0-9]/g, '') === '999motos'

/**
 * El logo de la concesionaria, o su nombre en texto cuando falta el archivo (el aviso lo muestra el paso 4). Si la concesionaria
 * ES la 999motos no se escribe nada: el logo 999 ya está arriba y repetirlo abajo en letras era ruido.
 */
export function LogoConcesionaria({ p, color, familia }: { p: PropsPlacaDiseno; color: string; familia: string }) {
  const caja = p.layout.cajas.logoConcesionaria
  if (p.recursos.logoConcesionaria) {
    if (!p.recursos.placaClara) return <Logo src={p.recursos.logoConcesionaria} caja={caja} />
    // El logo va tal cual; lo que se suma es una placa blanca redondeada que lo separa del fondo oscuro.
    return (
      <div style={enCaja({ x: caja.x - 20, y: caja.y - 6, w: caja.w + 40, h: caja.h + 12 }, { backgroundColor: '#FFFFFF', borderRadius: 14, alignItems: 'center', justifyContent: 'center' })}>
        <img src={p.recursos.logoConcesionaria} alt="" style={{ maxWidth: caja.w, maxHeight: caja.h, objectFit: 'contain' }} />
      </div>
    )
  }
  if (esNombre999(p.nombreConcesionaria)) return null
  return (
    <div style={enCaja(caja, { alignItems: 'center', justifyContent: 'center', fontFamily: familia, fontSize: Math.min(44, Math.floor(caja.h * 0.55)), fontWeight: 400, color, textTransform: 'uppercase', letterSpacing: 3 })}>
      {p.nombreConcesionaria}
    </div>
  )
}

/** Pin de ubicación para el pie. */
export function Pin({ tam, color }: { tam: number; color: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24">
      <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill={color} />
    </svg>
  )
}

/** Pastilla de color con texto adentro. */
export function Pastilla({ children, fondo, color, tam, familia, relleno = 24, inclinar }: { children: ReactNode; fondo: string; color: string; tam: number; familia: string; relleno?: number; inclinar?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: fondo,
        color,
        fontFamily: familia,
        fontWeight: 800,
        fontStyle: 'italic',
        fontSize: tam,
        lineHeight: 1.1,
        padding: `${Math.round(tam * 0.12)}px ${relleno}px`,
        textTransform: 'uppercase',
        letterSpacing: 1,
        ...(inclinar ? { transform: `skewX(${inclinar}deg)` } : {}),
      }}
    >
      {children}
    </div>
  )
}
