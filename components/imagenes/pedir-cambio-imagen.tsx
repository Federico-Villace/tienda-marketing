'use client'

import { useId, useState, type ReactNode } from 'react'
import { postEstimacionCambio } from '@/components/creativos/api'
import type { ResultadoConfirmacion } from '@/components/creativos/api'
import { campo } from '@/components/promocion/ui'
import { MAX_PEDIDO, MIN_PEDIDO } from '@/lib/agentes/conversacion/limites'
import { CompuertaImagen } from './compuerta-imagen'

/**
 * "Pedile un cambio" a UNA imagen ya generada: se escribe qué cambiar, se ve el precio y recién
 * "Confirmar US$ X" genera una imagen NUEVA a partir de esa (la original queda). Es la misma compuerta de
 * costo de siempre (regla dura #3). Sirve a Promociones, tandas y /creativos.
 */
export function PedirCambioImagen({
  creativoId,
  promocionId,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  alTerminar,
  debajo,
}: {
  creativoId: string
  /** En una imagen de promoción o tanda: la promoción desde la que se pide (el servidor la valida). */
  promocionId?: string | null
  puedeEditar: boolean
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  /** La imagen nueva ya está: p. ej. usarla en esta promoción. */
  alTerminar?: (r: Extract<ResultadoConfirmacion, { ok: true }>) => void
  /** Lo que sigue al terminar (p. ej. "Usar también en las otras 3 placas"). */
  debajo?: ReactNode
}) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [instruccion, setInstruccion] = useState('')
  const [ocupada, setOcupada] = useState(false)
  if (!puedeEditar) return null

  const largo = instruccion.trim().length
  return (
    <div className="mt-2 space-y-2">
      <button type="button" aria-expanded={abierto} className="text-xs underline hover:opacity-70" onClick={() => setAbierto((a) => !a)}>
        Pedile un cambio
      </button>
      {abierto && (
        <div className="space-y-2 rounded-md border border-(--color-borde) p-2">
          <label htmlFor={id} className="text-xs font-medium">
            ¿Qué querés cambiar de esta imagen?
          </label>
          <textarea
            id={id}
            className={campo}
            rows={2}
            maxLength={MAX_PEDIDO}
            value={instruccion}
            disabled={ocupada}
            placeholder="Ej.: más oscuro, de noche; la moto un poco más grande"
            onChange={(e) => setInstruccion(e.target.value)}
          />
          <p className="text-xs text-(--color-tenue) tabular-nums">{instruccion.length}/{MAX_PEDIDO} · Se genera una imagen nueva; esta se conserva.</p>
          <CompuertaImagen
            key={instruccion}
            apagado={apagado}
            puedeEditar={puedeEditar}
            deshabilitado={largo < MIN_PEDIDO}
            etiqueta="Ver precio del cambio"
            explicacion="Ver precio no cuesta nada: te muestra cuánto sale antes de gastar."
            topeUsd={topeUsd}
            gastadoUsd={gastadoUsd}
            despuesDeListo="La imagen nueva está arriba, en la lista."
            alOcuparse={setOcupada}
            alTerminar={alTerminar}
            pedir={() => postEstimacionCambio({ creativoId, instruccion: instruccion.trim(), promocionId: promocionId ?? null })}
          />
          {debajo}
        </div>
      )}
    </div>
  )
}
