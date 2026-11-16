'use client'

import { useState } from 'react'
import type { FotoSubida } from '@/components/creativos/api'
import { ElegirInspiracion } from '@/components/imagenes/elegir-inspiracion'
import type { InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'
import { boton, tarjetaOpcion } from './ui'

export const ID_TARJETA_COPIA = 'copia-fiel'

/**
 * La primera tarjeta de "Plantillas de diseño": "Copia fiel de tu referencia" (ADR-040). La IA copia una placa que te gusta con tu moto y
 * tus datos, y ESCRIBE los textos; antes de aprobar, un revisor automático los lee y comprueba que coincidan con lo que cargaste.
 * Sin foto de referencia deja subir o elegir una (un solo guardado: la plantilla, la foto y "Diseño completo"). Con foto no se muestra
 * ninguna vista previa de la referencia: solo que está elegida. Elegir no gasta nada. El lector ve la tarjeta sin controles.
 */
export function TarjetaCopiaFiel({
  elegida,
  puedeEditar,
  bloqueado,
  foto,
  inspiraciones,
  comprimirFoto,
  alElegir,
}: {
  elegida: boolean
  puedeEditar: boolean
  /** Hay algo guardándose: nada se toca hasta que termine. */
  bloqueado: boolean
  /** La foto de inspiración puesta (o null). */
  foto: { id: string; url: string | null; borrada: boolean } | null
  inspiraciones: readonly InspiracionElegible[]
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  /** Elige la copia fiel; con `foto`, la pone como referencia en el MISMO guardado. */
  alElegir: (foto?: FotoSubida) => void
}) {
  const [cambiando, setCambiando] = useState(false)
  const hayFoto = foto !== null && !foto.borrada
  const mostrarSelector = puedeEditar && (!hayFoto || cambiando)
  return (
    <div id={ID_TARJETA_COPIA} data-testid="tarjeta-copia-fiel" className="flex min-w-0 flex-col gap-2 sm:col-span-3">
      <label className={`${tarjetaOpcion} flex-col`}>
        <span className="flex items-center gap-2">
          <input type="radio" name="plantilla-diseno" checked={elegida} disabled={bloqueado || !puedeEditar || !hayFoto} onChange={() => alElegir()} />
          <span className="font-medium">Copia fiel de tu referencia</span>
        </span>
        <span className="text-xs text-(--color-tenue)">Subí una placa que te guste: la IA la copia con tu moto y tus datos. Antes de aprobar, se revisan solos los textos.</span>
      </label>
      {foto !== null && foto.borrada && <p className="text-sm">La foto de referencia se borró: subí otra.</p>}
      {hayFoto && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-(--color-ok)">✓ Referencia elegida</span>
          {puedeEditar && (
            <button type="button" className={boton} disabled={bloqueado} aria-expanded={cambiando} onClick={() => setCambiando((c) => !c)}>
              {cambiando ? 'Dejar la que está' : 'Cambiar'}
            </button>
          )}
        </p>
      )}
      {mostrarSelector && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{hayFoto ? 'Subí o elegí otra referencia' : 'Subí o elegí la placa que querés copiar'}</p>
          <ElegirInspiracion
            inspiraciones={inspiraciones}
            ocupado={bloqueado}
            alElegir={(f) => {
              setCambiando(false)
              alElegir(f)
            }}
            {...(comprimirFoto ? { comprimirFoto } : {})}
          />
        </div>
      )}
    </div>
  )
}
