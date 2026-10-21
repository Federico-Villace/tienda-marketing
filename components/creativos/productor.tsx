'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatearUsd } from '@/lib/estratega/formato'
import type { PiezaImagenVista } from '@/lib/productor/pantalla'
import { postConfirmar, postEstimacion, type EstimacionVista } from './api'
import { Galeria } from './galeria'

const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'

export type MotorImagen = { id: string; nombre: string; porImagenUsd: number }

type Fase = 'libre' | 'estimando' | 'corriendo'

/**
 * La compuerta de costo en pantalla (regla dura #3): se ESTIMA (el servidor
 * calcula), se MUESTRA el monto y recién el click en "Confirmar US$ X" gasta.
 * El cliente nunca manda un precio; solo qué pieza, qué motor y cuántas.
 * Mientras corre, y después del primer click, el botón no se puede volver a usar.
 */
export function Productor({
  piezas,
  piezaInicialId,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  motores,
  motorPorDefecto,
}: {
  piezas: readonly PiezaImagenVista[]
  piezaInicialId: string | null
  puedeEditar: boolean
  /** Por qué el Productor no puede gastar (sin clave o sin tope), o null. */
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motores: readonly MotorImagen[]
  motorPorDefecto: string
}) {
  const router = useRouter()
  const [piezaId, setPiezaId] = useState(piezas.find((p) => p.id === piezaInicialId)?.id ?? piezas[0]?.id ?? '')
  const [motor, setMotor] = useState(motorPorDefecto)
  const [cantidad, setCantidad] = useState(1)
  const [fase, setFase] = useState<Fase>('libre')
  const [estimacion, setEstimacion] = useState<{ datos: EstimacionVista; excede: boolean; bloqueada: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [costoReal, setCostoReal] = useState<number | null>(null)
  const enCurso = useRef(false)

  const pieza = piezas.find((p) => p.id === piezaId)
  const restante = topeUsd === null ? null : Math.max(0, topeUsd - gastadoUsd)

  function descartar() {
    setEstimacion(null)
    setError(null)
    setCostoReal(null)
  }

  async function pedirEstimacion() {
    if (enCurso.current || apagado || !pieza) return
    enCurso.current = true
    setFase('estimando')
    descartar()
    const r = await postEstimacion({ piezaId: pieza.id, motor, cantidad })
    enCurso.current = false
    setFase('libre')
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEstimacion({ datos: r.generacion, excede: r.excedeTope, bloqueada: false })
  }

  async function confirmar() {
    // La ref corta un doble click inmediato (el estado se actualiza después del render).
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

  if (piezas.length === 0) {
    return (
      <p className="text-sm text-(--color-tenue)">
        No hay piezas aprobadas de formato imagen, carrusel o historia. Aprobá una en{' '}
        <Link href="/contenido" className="underline">
          Contenido
        </Link>
        .
      </p>
    )
  }

  const corriendo = fase === 'corriendo'

  return (
    <div className="space-y-6">
      {apagado && (
        <p role="status" className="rounded-lg border border-(--color-aviso) px-4 py-2.5 text-sm text-(--color-aviso)">
          {apagado}
        </p>
      )}

      {topeUsd !== null && restante !== null && (
        <p className="text-sm">
          Gastado este mes: {formatearUsd(gastadoUsd)} de {formatearUsd(topeUsd)} (quedan {formatearUsd(restante)})
        </p>
      )}

      <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
        <label className="block text-sm">
          Pieza
          <select
            aria-label="Pieza"
            className={campo}
            value={piezaId}
            disabled={corriendo}
            onChange={(e) => {
              setPiezaId(e.target.value)
              descartar()
            }}
          >
            {piezas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pieza.plataforma} {p.pieza.formato} · {p.pieza.hook.slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
        {pieza && (
          <p className="text-xs text-(--color-tenue)">
            Proporción {pieza.aspecto} · Brief visual: {pieza.pieza.briefVisual}
          </p>
        )}

        {puedeEditar && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Motor
                <select
                  aria-label="Motor"
                  className={campo}
                  value={motor}
                  disabled={corriendo}
                  onChange={(e) => {
                    setMotor(e.target.value)
                    descartar()
                  }}
                >
                  {motores.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} · ~{formatearUsd(m.porImagenUsd)} c/u
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Cantidad
                <select
                  aria-label="Cantidad"
                  className={campo}
                  value={cantidad}
                  disabled={corriendo}
                  onChange={(e) => {
                    setCantidad(Number(e.target.value))
                    descartar()
                  }}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-(--color-tenue)">
              Video: referencial, no disponible. Las imágenes son de 1K.
            </p>

            <button type="button" className={boton} disabled={apagado !== null || fase !== 'libre'} onClick={() => void pedirEstimacion()}>
              Estimar
            </button>

            {estimacion && (
              <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
                <p className="text-sm">
                  {estimacion.datos.cantidad} × ~{formatearUsd(estimacion.datos.porImagenUsd)} (precio de lista{' '}
                  {formatearUsd(estimacion.datos.listaUsd)}). El tope incluye el pensamiento y la entrada del modelo; el costo real
                  puede ser menor.
                </p>
                {estimacion.excede && (
                  <p className="text-sm text-(--color-falta)">Esta generación supera el tope mensual: no se puede confirmar.</p>
                )}
                <button
                  type="button"
                  className={boton}
                  disabled={corriendo || estimacion.excede || estimacion.bloqueada}
                  onClick={() => void confirmar()}
                >
                  {corriendo ? 'Generando… hasta 2 min' : `Confirmar ${formatearUsd(estimacion.datos.costoEstimadoUsd)}`}
                </button>
                {!corriendo && <p className="text-xs text-(--color-tenue)">Esta estimación vence a los 15 minutos.</p>}
              </div>
            )}
            {costoReal !== null && <p className="text-sm">Listo. Costo real: {formatearUsd(costoReal)}</p>}
            {error && (
              <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {pieza && <Galeria pieza={pieza} puedeEditar={puedeEditar} />}
    </div>
  )
}
