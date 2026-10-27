'use client'

import { useEffect, useRef, useState } from 'react'
import { ajustarTextos, ErrorTextoLargo, medidasDe, type AjusteTextos, type TextosPlaca } from '@/lib/promocion/plantillas'
import type { AspectoFoto } from '@/lib/productor/ediciones'
import type { IdPlantilla, PosicionMoto } from '@/lib/promocion/tipos'
import { Placa, type FuentesPlaca } from './placa'

/**
 * Vista previa EN VIVO de la placa: el mismo <Placa> que dibuja el servidor, escalado al
 * ancho de la pantalla. Es gratis y no llama a nadie. Es una aproximación (el navegador y
 * satori pueden diferir unos píxeles): "Ver la versión final" arma el PNG real.
 */
export function VistaPlaca({
  escenaSrc,
  textos,
  plantilla,
  posicionMoto = 'centro',
  aspecto,
  fuentes,
  decorativa = false,
}: {
  escenaSrc: string
  textos: TextosPlaca
  plantilla: IdPlantilla
  /** Al costado define de qué lado va el texto (el opuesto a la moto). */
  posicionMoto?: PosicionMoto
  aspecto: AspectoFoto
  fuentes: FuentesPlaca
  /** Una miniatura de una lista: el lector de pantalla la ignora. */
  decorativa?: boolean
}) {
  const { ancho, alto } = medidasDe(aspecto)
  const caja = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.3)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const medir = () => el.clientWidth > 0 && setEscala(el.clientWidth / ancho)
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [ancho])

  let ajuste: AjusteTextos | null = null
  let error: string | null = null
  try {
    ajuste = ajustarTextos(textos, plantilla, aspecto, posicionMoto)
  } catch (e) {
    error = e instanceof ErrorTextoLargo ? e.message : 'No se pudo armar la vista previa.'
  }

  if (error || !ajuste) {
    return (
      <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
        {error}
      </p>
    )
  }

  return (
    <div
      ref={caja}
      style={{ aspectRatio: `${ancho} / ${alto}`, position: 'relative', overflow: 'hidden', width: '100%' }}
      className="rounded-md border border-(--color-borde)"
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Vista previa de la imagen: ${textos.modelo}, ${textos.precio}` })}
    >
      <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: ancho, height: alto }}>
        <Placa escenaSrc={escenaSrc} textos={textos} plantilla={plantilla} posicionMoto={posicionMoto} aspecto={aspecto} ajuste={ajuste} fuentes={fuentes} />
      </div>
    </div>
  )
}
