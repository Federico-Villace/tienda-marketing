/**
 * Placa de la copia fiel (ADR-040): la imagen que hizo la IA (con los textos YA escritos y revisados) a sangre, y encima, si hay, el
 * logo REAL de la concesionaria en la caja que vio el verificador. Nada de texto de satori: lo escribió la IA y lo revisó el servidor.
 * Mismas reglas que <Placa>: puro, sin hooks, solo estilos inline y `display: flex`, porque lo dibuja satori.
 */

import type { Caja01 } from '@/lib/promocion/copia/tipos'

export type PropsPlacaCopiaFiel = {
  escenaSrc: string
  ancho: number
  alto: number
  /** El logo real como data URI, o null si no se pega ninguno (la IA escribió el nombre, o la persona sacó los logos). */
  logoSrc: string | null
  /** Una placa blanca detrás del logo (logos de letras oscuras sobre un fondo oscuro). */
  placaClara?: boolean
  /** La caja del logo, relativa a la imagen (0..1). */
  caja: Caja01
}

export function PlacaCopiaFiel({ escenaSrc, ancho, alto, logoSrc, placaClara = false, caja }: PropsPlacaCopiaFiel) {
  const x = Math.round(caja.x * ancho)
  const y = Math.round(caja.y * alto)
  const w = Math.round(caja.w * ancho)
  const h = Math.round(caja.h * alto)
  return (
    <div style={{ display: 'flex', position: 'relative', width: ancho, height: alto, overflow: 'hidden', backgroundColor: '#000000' }}>
      <img src={escenaSrc} alt="" width={ancho} height={alto} style={{ position: 'absolute', left: 0, top: 0, width: ancho, height: alto, objectFit: 'cover' }} />
      {logoSrc ? (
        <div style={{ display: 'flex', position: 'absolute', left: x, top: y, width: w, height: h, alignItems: 'center', justifyContent: 'center', ...(placaClara ? { backgroundColor: '#FFFFFF', borderRadius: 14 } : {}) }}>
          <img src={logoSrc} alt="" style={{ maxWidth: w, maxHeight: h, objectFit: 'contain' }} />
        </div>
      ) : null}
    </div>
  )
}
