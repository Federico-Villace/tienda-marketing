'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatearUsd } from '@/lib/estratega/formato'
import { postConfirmar, type EstimacionVista, type ResultadoEstimacion } from './api'

export type Fase = 'libre' | 'estimando' | 'corriendo'
export type EstimacionEnPantalla = { datos: EstimacionVista; excede: boolean; bloqueada: boolean }

/**
 * La compuerta de costo del lado del cliente (regla dura #3), compartida por
 * las piezas y las fotos: se ESTIMA (el servidor calcula), se MUESTRA el monto
 * y recién el click en "Confirmar US$ X" gasta. Una ref corta el doble click
 * inmediato; el estado se actualiza después del render.
 */
export function usarCompuerta(apagado: string | null) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('libre')
  const [estimacion, setEstimacion] = useState<EstimacionEnPantalla | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [costoReal, setCostoReal] = useState<number | null>(null)
  const enCurso = useRef(false)

  function descartar() {
    setEstimacion(null)
    setError(null)
    setCostoReal(null)
  }

  async function pedirEstimacion(estimar: () => Promise<ResultadoEstimacion>) {
    if (enCurso.current || apagado) return
    enCurso.current = true
    setFase('estimando')
    descartar()
    const r = await estimar()
    enCurso.current = false
    setFase('libre')
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEstimacion({ datos: r.generacion, excede: r.excedeTope, bloqueada: false })
  }

  async function confirmar() {
    if (enCurso.current || !estimacion || estimacion.excede || estimacion.bloqueada) return
    enCurso.current = true
    setFase('corriendo')
    setError(null)
    const r = await postConfirmar(estimacion.datos.id)
    enCurso.current = false
    setFase('libre')
    if (r.ok) {
      setEstimacion(null)
      setCostoReal(r.generacion.costoRealUsd)
      router.refresh()
      return
    }
    if (r.status === 402) {
      setError(
        r.restanteUsd !== undefined && r.topeUsd !== undefined
          ? `Supera el tope mensual: quedan ${formatearUsd(r.restanteUsd)} de ${formatearUsd(r.topeUsd)}.`
          : r.error,
      )
      setEstimacion({ ...estimacion, bloqueada: true })
      return
    }
    setError(r.error)
    // 409 (ya se confirmó), 410 (venció) y cualquier otro fallo: esa estimación ya no sirve.
    setEstimacion(null)
    if (r.status !== 410) router.refresh()
  }

  return { fase, estimacion, error, costoReal, pedirEstimacion, confirmar, descartar }
}
