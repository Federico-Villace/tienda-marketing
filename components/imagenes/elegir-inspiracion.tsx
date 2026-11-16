'use client'

import type { FotoSubida } from '@/components/creativos/api'
import { SubirFoto } from '@/components/creativos/subir-foto'
import type { InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'

/**
 * Elegir una foto de inspiración: una de las que ya se subieron o una nueva (con el checkbox de derechos de siempre).
 * Lo usan "Foto de inspiración" de las opciones de imagen y la tarjeta "Como tu referencia" del paso 4: mismo camino de subida,
 * mismo guardado (el padre decide qué hacer con la foto elegida). Elegir no gasta nada.
 */
export function ElegirInspiracion({
  inspiraciones = [],
  ocupado,
  alElegir,
  comprimirFoto,
}: {
  inspiraciones?: readonly InspiracionElegible[]
  ocupado: boolean
  alElegir: (foto: FotoSubida) => void
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
}) {
  return (
    <div className="space-y-3">
      {inspiraciones.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Elegir una que ya subiste</p>
          <ul className="flex flex-wrap gap-2">
            {inspiraciones.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  className="overflow-hidden rounded-md border border-(--color-borde) hover:opacity-70 disabled:opacity-50"
                  disabled={ocupado}
                  aria-label={`Usar la inspiración subida el ${x.creadoEn.slice(0, 10)}`}
                  onClick={() => alElegir({ id: x.id, ancho: 0, alto: 0, url: x.url })}
                >
                  {x.url ? <img src={x.url} alt="" loading="lazy" className="size-20 object-cover" /> : <span className="block px-2 py-6 text-xs">Sin vista previa</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SubirFoto puedeEditar uso="inspiracion" {...(comprimirFoto ? { comprimirFoto } : {})} alSubir={alElegir} />
    </div>
  )
}
