'use client'

import type { ReactNode } from 'react'
import type { FotoSubida } from '@/components/creativos/api'
import { ElegirInspiracion } from '@/components/imagenes/elegir-inspiracion'
import type { InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { LeerReferencia, type ResultadoLeer } from './leer-referencia'

export const ID_TARJETA_REFERENCIA = 'como-tu-referencia'

/**
 * La tarjeta "Como tu referencia" del selector de plantillas (ADR-039). Es UNA sola tarjeta con todo el recorrido, para no ir y venir
 * por la pantalla: sin foto, deja subir o elegir una; con foto, ofrece "Leer el diseño · US$ X" por la compuerta de siempre
 * (precio → "Confirmar US$ X"); ya leída, es la opción elegible (`opcion`) y el resumen de lo que pasó queda abajo.
 * El lector no ve ningún control (solo la opción, si ya hay una lectura lista). Subir o elegir una foto no gasta nada.
 */
export function TarjetaReferencia({
  opcion,
  puedeEditar,
  bloqueado,
  foto,
  inspiraciones,
  comprimirFoto,
  alElegirFoto,
  lectura,
  apagado,
  yaLeida,
  leer,
}: {
  /** La opción elegible ("Como tu referencia" con su vista previa), cuando ya hay una lectura lista; null si todavía no. */
  opcion: ReactNode | null
  puedeEditar: boolean
  /** Hay algo guardándose: nada se toca hasta que termine. */
  bloqueado: boolean
  /** La foto de inspiración puesta (o null si no hay). */
  foto: { id: string; url: string | null; borrada: boolean } | null
  inspiraciones: readonly InspiracionElegible[]
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  /** Pone la foto elegida como inspiración (mismo guardado de siempre). */
  alElegirFoto: (foto: FotoSubida) => void
  /** Lo más que cuesta leer esta foto (null = sin precio) y si ya se leyó. */
  lectura: { costoUsd: number | null; gratis: boolean }
  apagado: string | null
  /** Ya hay una lectura lista de esta foto: no se ofrece leerla otra vez. */
  yaLeida: boolean
  leer: (aceptadoUsd: number) => Promise<ResultadoLeer>
}) {
  const hayFoto = foto !== null && !foto.borrada && foto.url !== null
  const cuerpoEditable = puedeEditar && (
    <div className="space-y-3" data-testid="tarjeta-referencia-pasos">
      {!yaLeida && opcion === null && (
        <p className="text-sm text-(--color-tenue)">
          Copiamos el armado de una placa que te gusta: dónde va cada cosa, sus colores y su letra. Se arma con tu texto y tu precio.
        </p>
      )}
      {!yaLeida && foto !== null && foto.borrada && <p className="text-sm">La foto de referencia se borró: subí otra.</p>}
      {!yaLeida && !hayFoto && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Subí o elegí la placa que querés copiar</p>
          <ElegirInspiracion inspiraciones={inspiraciones} ocupado={bloqueado} alElegir={alElegirFoto} {...(comprimirFoto ? { comprimirFoto } : {})} />
        </div>
      )}
      {!yaLeida && hayFoto && <img src={foto.url!} alt="Foto de referencia" loading="lazy" className="max-h-40 rounded-md border border-(--color-borde)" />}
      {(hayFoto || yaLeida) && (
        <LeerReferencia costoUsd={lectura.costoUsd} gratis={lectura.gratis} puedeEditar={puedeEditar} apagado={apagado} deshabilitado={bloqueado} yaLeida={yaLeida} leer={leer} />
      )}
    </div>
  )

  return (
    <div id={ID_TARJETA_REFERENCIA} data-testid="tarjeta-referencia" className={opcion === null ? 'min-w-0 space-y-3 rounded-lg border border-(--color-borde) px-3 py-3 sm:col-span-3' : 'flex min-w-0 flex-col gap-2'}>
      {opcion ?? <h3 className="text-sm font-medium">Como tu referencia</h3>}
      {cuerpoEditable}
    </div>
  )
}
