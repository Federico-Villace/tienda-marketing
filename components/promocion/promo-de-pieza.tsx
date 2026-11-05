'use client'

import { useRef, useState } from 'react'
import { LIMITES_PROMOCION } from '@/lib/promocion/datos'
import { TIPOS_PROMO, type PromocionVista, type TipoPromo } from '@/lib/promocion/tipos'
import { patchPromocion } from './api'
import { boton, campo } from './ui'

const PROMOS: Record<TipoPromo, string> = { contado: 'Contado', cuotas: 'Cuotas', credito: 'Crédito', oferta: 'Oferta', ninguna: 'Ninguna' }

/**
 * La promo de UNA pieza (tipo y detalle). Cada placa lleva la suya en `datos.promo`: acá se cambia solo la de
 * esta pieza y se guarda con un PATCH de sus datos completos (el servidor revalida todo). Es gratis; los
 * textos que ya tenía pasan a desactualizados y se avisa.
 */
export function PromoDePieza({
  promocion,
  puede,
  tieneTextos,
  alGuardar,
}: {
  promocion: PromocionVista
  puede: boolean
  /** La pieza ya tiene textos escritos con IA o elegidos. */
  tieneTextos: boolean
  alGuardar: (p: PromocionVista) => void
}) {
  const [tipo, setTipo] = useState<TipoPromo>(promocion.datos.promo.tipo)
  const [detalle, setDetalle] = useState(promocion.datos.promo.detalle)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cambio, setCambio] = useState(false)
  const enCurso = useRef(false)

  if (!puede || promocion.estado !== 'borrador') return null
  const igual = tipo === promocion.datos.promo.tipo && detalle.trim() === promocion.datos.promo.detalle.trim()

  async function guardar() {
    if (enCurso.current || igual) return
    enCurso.current = true
    setGuardando(true)
    setError(null)
    const r = await patchPromocion(promocion.id, { revision: promocion.revision, datos: { ...promocion.datos, promo: { tipo, detalle: detalle.trim() } } })
    enCurso.current = false
    setGuardando(false)
    if (!r.ok) {
      setError(r.errores && r.errores.length > 0 ? r.errores.join(' ') : r.error)
      return
    }
    setCambio(true)
    alGuardar(r.promocion)
  }

  const id = promocion.id
  return (
    <div className="space-y-1.5">
      <label htmlFor={`promo-${id}`} className="text-xs font-medium">
        Promo de esta pieza
      </label>
      <select id={`promo-${id}`} className={campo} value={tipo} disabled={guardando} onChange={(e) => setTipo(e.target.value as TipoPromo)}>
        {TIPOS_PROMO.map((t) => (
          <option key={t} value={t}>
            {PROMOS[t]}
          </option>
        ))}
      </select>
      <label htmlFor={`promo-detalle-${id}`} className="text-xs font-medium">
        Detalle de la promo
      </label>
      <input id={`promo-detalle-${id}`} className={campo} value={detalle} maxLength={LIMITES_PROMOCION.DETALLE} disabled={guardando} onChange={(e) => setDetalle(e.target.value)} />
      <button type="button" className={boton} disabled={guardando || igual} onClick={() => void guardar()}>
        {guardando ? 'Guardando…' : 'Guardar la promo de esta pieza'}
      </button>
      {cambio && igual && tieneTextos && (
        <p role="status" className="text-xs text-(--color-aviso)">
          Cambió la promo: pedí el texto de nuevo o escribilo a mano.
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
