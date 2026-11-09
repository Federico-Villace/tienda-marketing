'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ajustarTextos, ErrorTextoLargo, medidasDe, type AjusteTextos, type TextosPlaca } from '@/lib/promocion/plantillas'
import type { AspectoFoto } from '@/lib/productor/ediciones'
import { esPlantillaClasica, esPlantillaDiseno, type DatosPromocion, type IdPlantilla, type PosicionMoto } from '@/lib/promocion/tipos'
import { prepararDiseno } from '@/lib/promocion/diseno/preparar'
import { idsDeRecursosDe, type IdsRecursos } from '@/lib/promocion/diseno/recursos-ids'
import type { Diseno } from '@/lib/promocion/diseno/tipos'
import { Placa, type FuentesPlaca } from './placa'
import { MANIFIESTO_VACIO, useContextoDiseno } from './contexto-diseno'
import type { RecursosPlaca } from './placas/tipos'

const urlDe = (id: string | null) => (id ? `/api/placa-recursos/${id}` : null)
/** En el navegador los recursos son URLs de /api/placa-recursos (con sesión), no data URIs. */
const aUrls = (ids: IdsRecursos): RecursosPlaca => ({ logo999: urlDe(ids.logo999), logoConcesionaria: urlDe(ids.logoConcesionaria), logoMarca: urlDe(ids.logoMarca), textura: urlDe(ids.textura), raspado: urlDe(ids.raspado), placaClara: ids.placaClara })

/** Lo que una plantilla de diseño necesita de la promoción: la marca (sus logos), los datos (la condición) y el diseño guardado. */
export type PromocionParaDiseno = { marcaId: string; datos: DatosPromocion; diseno: Diseno | null }

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
  promocion,
  formato,
  disenoVivo,
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
  /** Solo plantillas de diseño. */
  promocion?: PromocionParaDiseno
  /** Solo plantillas de diseño: otro tamaño que el de la promoción. */
  formato?: AspectoFoto
  /** Solo plantillas de diseño: el diseño que se está escribiendo (todavía sin guardar) manda sobre el guardado. */
  disenoVivo?: Diseno | null
}) {
  const contexto = useContextoDiseno()
  const { ancho, alto } = medidasDe(formato ?? aspecto)
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
  let arbol: ReactNode = null
  let error: string | null = null
  try {
    if (esPlantillaDiseno(plantilla)) {
      if (!promocion) throw new Error('Falta la promoción para dibujar el diseño.')
      const prep = prepararDiseno({ plantilla, formato: formato ?? aspecto, textos, guardado: disenoVivo !== undefined ? disenoVivo : promocion.diseno, datos: promocion.datos })
      const ids = idsDeRecursosDe(contexto.manifiesto ?? MANIFIESTO_VACIO, promocion.marcaId, plantilla, prep.diseno.logoMarca)
      arbol = <Placa plantilla={plantilla} escenaSrc={escenaSrc} textos={textos} diseno={prep.diseno} layout={prep.layout} ajuste={prep.ajuste} recursos={aUrls(ids)} familias={contexto.familias} nombreConcesionaria={textos.marca} />
    } else if (esPlantillaClasica(plantilla)) {
      ajuste = ajustarTextos(textos, plantilla, aspecto, posicionMoto)
      arbol = <Placa escenaSrc={escenaSrc} textos={textos} plantilla={plantilla} posicionMoto={posicionMoto} aspecto={aspecto} ajuste={ajuste} fuentes={fuentes} />
    }
  } catch (e) {
    error = e instanceof ErrorTextoLargo ? e.message : 'No se pudo armar la vista previa.'
  }

  if (error || !arbol) {
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
        {arbol}
      </div>
    </div>
  )
}
