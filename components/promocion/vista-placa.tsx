'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ajustarTextos, ErrorTextoLargo, medidasDe, type AjusteTextos, type TextosPlaca } from '@/lib/promocion/plantillas'
import type { AspectoFoto } from '@/lib/productor/ediciones'
import { esPlantillaClasica, esPlantillaDiseno, type DatosPromocion, type IdPlantilla, type PosicionMoto } from '@/lib/promocion/tipos'
import { prepararDiseno } from '@/lib/promocion/diseno/preparar'
import { idsDeRecursosDe, type IdsRecursos } from '@/lib/promocion/diseno/recursos-ids'
import type { Diseno } from '@/lib/promocion/diseno/tipos'
import type { PlantillaReferencia } from '@/lib/promocion/referencia/tipos'
import { tonoDeReferencia } from '@/lib/promocion/referencia/acento'
import { layoutGrilla, type TextosGrilla } from '@/lib/promocion/varias/grilla'
import { idsDeRecursosGrilla } from '@/lib/promocion/varias/recursos-grilla'
import type { Ocultable } from '@/lib/promocion/diseno/tipos'
import { Placa, type FuentesPlaca } from './placa'
import { PlacaGrilla } from './placas/grilla'
import { MANIFIESTO_VACIO, useContextoDiseno } from './contexto-diseno'
import type { RecursosPlaca } from './placas/tipos'

/** La plantilla de la referencia sin lectura (todavía no se leyó, o se descartó): no hay con qué dibujarla. */
class ErrorSinLectura extends Error {
  constructor() {
    super('Todavía no se leyó tu referencia: leela en el paso 4.')
  }
}

const urlDe = (id: string | null) => (id ? `/api/placa-recursos/${id}` : null)
/** En el navegador los recursos son URLs de /api/placa-recursos (con sesión), no data URIs. */
const aUrls = (ids: IdsRecursos): RecursosPlaca => ({ logo999: urlDe(ids.logo999), logoConcesionaria: urlDe(ids.logoConcesionaria), logoMarca: urlDe(ids.logoMarca), textura: urlDe(ids.textura), raspado: urlDe(ids.raspado), placaClara: ids.placaClara })

/** Lo que una plantilla de diseño necesita de la promoción: la marca (sus logos), los datos (la condición) y el diseño guardado. */
export type PromocionParaDiseno = { marcaId: string; datos: DatosPromocion; diseno: Diseno | null; /** Solo la plantilla 'referencia': lo leído de la foto de inspiración. */ referencia?: PlantillaReferencia | null }

/** Lo que la grilla de motos (ADR-041) necesita para dibujarse en el navegador: lo que se escribe, la foto de cada moto (URL) y los logos. */
export type GrillaParaVista = { textos: TextosGrilla; fotos: readonly (string | null)[]; marcaId: string; ocultos: readonly Ocultable[] }

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
  grilla,
  etiqueta,
}: {
  escenaSrc: string
  textos: TextosPlaca
  plantilla: IdPlantilla | 'varias_motos'
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
  /** Solo la grilla de motos. */
  grilla?: GrillaParaVista
  /** Lo que lee un lector de pantalla (sin él: el modelo y el precio de la placa). */
  etiqueta?: string
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
    if (plantilla === 'varias_motos') {
      if (!grilla) throw new Error('Falta lo que se escribe en la grilla.')
      const layout = layoutGrilla(grilla.textos, formato ?? aspecto)
      const ids = idsDeRecursosGrilla(contexto.manifiesto ?? MANIFIESTO_VACIO, grilla.marcaId, grilla.ocultos)
      arbol = <PlacaGrilla layout={layout} textos={grilla.textos} fotos={grilla.fotos} recursos={aUrls(ids)} familias={contexto.familias} />
    } else if (esPlantillaDiseno(plantilla)) {
      if (!promocion) throw new Error('Falta la promoción para dibujar el diseño.')
      // La plantilla de la referencia se dibuja con lo leído de la foto de inspiración: sin esa lectura no hay con qué.
      const referencia = plantilla === 'referencia' ? promocion.referencia : undefined
      if (plantilla === 'referencia' && !referencia) throw new ErrorSinLectura()
      const prep = prepararDiseno({ plantilla, formato: formato ?? aspecto, textos, guardado: disenoVivo !== undefined ? disenoVivo : promocion.diseno, datos: promocion.datos, ...(referencia ? { referencia } : {}) })
      const ids = idsDeRecursosDe(contexto.manifiesto ?? MANIFIESTO_VACIO, promocion.marcaId, plantilla, prep.diseno.logoMarca, referencia ? tonoDeReferencia(referencia) : undefined)
      arbol = <Placa plantilla={plantilla} escenaSrc={escenaSrc} textos={textos} diseno={prep.diseno} layout={prep.layout} ajuste={prep.ajuste} recursos={aUrls(ids)} familias={contexto.familias} nombreConcesionaria={textos.marca} {...(referencia ? { referencia, aspectoEscena: aspecto } : {})} />
    } else if (esPlantillaClasica(plantilla)) {
      ajuste = ajustarTextos(textos, plantilla, aspecto, posicionMoto)
      arbol = <Placa escenaSrc={escenaSrc} textos={textos} plantilla={plantilla} posicionMoto={posicionMoto} aspecto={aspecto} ajuste={ajuste} fuentes={fuentes} />
    }
  } catch (e) {
    error = e instanceof ErrorTextoLargo || e instanceof ErrorSinLectura ? e.message : 'No se pudo armar la vista previa.'
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
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': etiqueta ?? `Vista previa de la imagen: ${textos.modelo}, ${textos.precio}` })}
    >
      <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: ancho, height: alto }}>
        {arbol}
      </div>
    </div>
  )
}
