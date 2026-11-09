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

/** Un logo tal cual (sin pasarlo por ningún filtro), centrado en su caja. */
export function Logo({ src, caja }: { src: string; caja: Caja }) {
  return (
    <div style={enCaja(caja, { alignItems: 'center', justifyContent: 'center' })}>
      <img src={src} alt="" style={{ maxWidth: caja.w, maxHeight: caja.h, objectFit: 'contain' }} />
    </div>
  )
}

/** El logo de la concesionaria, o su nombre en texto cuando falta el archivo (el aviso lo muestra el paso 4). */
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
