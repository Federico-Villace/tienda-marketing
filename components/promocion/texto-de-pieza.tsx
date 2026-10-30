'use client'

import { useState } from 'react'
import type { CopyPromo } from '@/lib/promocion/tipos'
import { boton } from './ui'

/**
 * Las 3 opciones de texto de UNA pieza de la tanda, para elegir sin entrar a la pieza.
 * Elegir manda SOLO el número de opción (el texto sale de lo que guardó el servidor): es gratis.
 */
export function TextoDePieza({
  opciones,
  elegido,
  desactualizado,
  puede,
  alElegir,
}: {
  opciones: CopyPromo[]
  /** El texto que tiene la pieza hoy (null = ninguno todavía). */
  elegido: CopyPromo | null
  desactualizado: boolean
  puede: boolean
  alElegir: (opcion: number) => void
}) {
  const [cambiando, setCambiando] = useState(false)
  const [abierta, setAbierta] = useState<number | null>(null)

  if (elegido && !cambiando) {
    return (
      <div className="space-y-1 text-xs">
        <p className="font-medium">{elegido.titular}</p>
        <p className="text-(--color-tenue)">{elegido.hook}</p>
        {puede && opciones.length > 0 && (
          <button type="button" className={boton} onClick={() => setCambiando(true)}>
            Cambiar el texto
          </button>
        )}
      </div>
    )
  }
  if (opciones.length === 0) return null
  return (
    <div className="space-y-2 text-xs">
      {desactualizado && <p className="text-(--color-aviso)">Cambiaste los datos después de escribir estos textos: abrí la pieza y pedí otros.</p>}
      <p className="font-medium">Elegí el texto</p>
      <ul className="space-y-2">
        {opciones.map((o, i) => (
          <li key={i} className="space-y-1 rounded-md border border-(--color-borde) p-2">
            <p className="font-medium">{o.titular}</p>
            <p className="text-(--color-tenue)">{o.hook}</p>
            {abierta === i && (
              <div className="space-y-1">
                <p className="whitespace-pre-wrap">{o.copy}</p>
                <p className="text-(--color-tenue)">{o.hashtags.join(' ')}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={boton} aria-expanded={abierta === i} onClick={() => setAbierta(abierta === i ? null : i)}>
                {abierta === i ? 'Ver menos' : 'Ver completo'}
              </button>
              {puede && (
                <button
                  type="button"
                  className={boton}
                  onClick={() => {
                    setCambiando(false)
                    alElegir(i + 1)
                  }}
                >
                  Usar esta
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {elegido && (
        <button type="button" className={boton} onClick={() => setCambiando(false)}>
          Dejar el que tenía
        </button>
      )}
    </div>
  )
}
