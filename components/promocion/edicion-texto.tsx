'use client'

import { useEffect, useRef, useState } from 'react'
import { limitesTexto } from '@/lib/promocion/plantillas'
import { posicionTextoDe, esPlantilla, type PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion } from './api'
import { campo } from './ui'

const ESPERA_GUARDADO_MS = 800
const tieneEmoji = (t: string) => /\p{Extended_Pictographic}/u.test(t)

/**
 * El titular y la línea extra de UNA pieza de un lote de textos, editables en la tarjeta (ADR-032). Se
 * guardan solos al dejar de escribir; cada guardado sale con la última revisión de la pieza y van en
 * fila, así dos guardados seguidos nunca chocan. El precio no se toca acá: es el que se cargó al crear.
 */
export function EdicionTexto({
  promocion,
  puede,
  alGuardar,
  esperaGuardadoMs = ESPERA_GUARDADO_MS,
}: {
  promocion: PromocionVista
  puede: boolean
  alGuardar: (p: PromocionVista) => void
  esperaGuardadoMs?: number
}) {
  const guardado = (p: PromocionVista) => ({ titular: p.titular ?? p.copy?.titular ?? '', lineaExtra: p.lineaExtra ?? '' })
  const [titular, setTitular] = useState(guardado(promocion).titular)
  const [lineaExtra, setLineaExtra] = useState(guardado(promocion).lineaExtra)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto')
  // La última pieza guardada: cada PATCH sale con SU revisión.
  const ultima = useRef(promocion)
  if (promocion.revision > ultima.current.revision) ultima.current = promocion
  const valores = useRef({ titular, lineaExtra })
  const cola = useRef<Promise<unknown>>(Promise.resolve())
  const abierta = promocion.estado === 'borrador'
  const activo = puede && abierta
  const limites = limitesTexto(esPlantilla(promocion.plantilla) ? posicionTextoDe(promocion.plantilla) : 'abajo')

  function guardarPendiente() {
    const p = cola.current.then(async () => {
      const campos: Record<string, unknown> = {}
      const t = valores.current.titular.trim()
      if (t !== '' && t !== guardado(ultima.current).titular) campos.titular = t
      const l = valores.current.lineaExtra.trim() === '' ? null : valores.current.lineaExtra.trim()
      if (!tieneEmoji(valores.current.lineaExtra) && l !== (ultima.current.lineaExtra ?? null)) campos.lineaExtra = l
      if (Object.keys(campos).length === 0) return
      setEstado('guardando')
      const r = await patchPromocion(ultima.current.id, { revision: ultima.current.revision, ...campos })
      if (!r.ok) {
        setError(r.errores && r.errores.length > 0 ? r.errores.join(' ') : r.error)
        setEstado('quieto')
        return
      }
      ultima.current = r.promocion
      setError(null)
      setEstado('guardado')
      alGuardar(r.promocion)
    })
    cola.current = p.catch(() => undefined)
  }

  // Guardado automático: al dejar de escribir un rato.
  useEffect(() => {
    if (!activo) return
    const t = setTimeout(guardarPendiente, esperaGuardadoMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titular, lineaExtra, activo, esperaGuardadoMs])

  if (!activo) {
    const g = guardado(promocion)
    return (
      <div className="space-y-0.5 text-sm">
        <p className="font-medium">{g.titular}</p>
        {g.lineaExtra && <p className="text-xs text-(--color-tenue)">{g.lineaExtra}</p>}
      </div>
    )
  }

  const id = promocion.id
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`titular-${id}`} className="text-xs font-medium">
          Titular
        </label>
        <input
          id={`titular-${id}`}
          className={campo}
          value={titular}
          maxLength={limites.titular}
          onChange={(e) => {
            valores.current.titular = e.target.value
            setTitular(e.target.value)
            setEstado('quieto')
          }}
          onBlur={guardarPendiente}
        />
      </div>
      <div>
        <label htmlFor={`extra-${id}`} className="text-xs font-medium">
          Línea extra
        </label>
        <input
          id={`extra-${id}`}
          className={campo}
          value={lineaExtra}
          maxLength={limites.extra}
          onChange={(e) => {
            valores.current.lineaExtra = e.target.value
            setLineaExtra(e.target.value)
            setEstado('quieto')
          }}
          onBlur={guardarPendiente}
        />
        {tieneEmoji(lineaExtra) && <p className="mt-0.5 text-xs text-(--color-falta)">No puede llevar emojis: no se dibujan en la imagen.</p>}
      </div>
      {estado !== 'quieto' && (
        <p role="status" className="text-xs text-(--color-tenue)">
          {estado === 'guardando' ? 'Guardando…' : 'Guardado'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-(--color-falta)">
          {error}
        </p>
      )}
    </div>
  )
}
