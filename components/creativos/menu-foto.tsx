'use client'

import { useState } from 'react'
import { ASPECTOS_FOTO, EDICIONES_FOTO, type AspectoFoto, type IdEdicion, type ItemMenuFoto } from '@/lib/productor/ediciones'
import { formatearUsd } from '@/lib/estratega/formato'
import type { FotoVista } from '@/lib/productor/pantalla'
import { postEstimacionFoto } from './api'
import { usarCompuerta } from './compuerta-cliente'
import type { MotorImagen } from './productor'

const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1 text-sm'
const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * El menú de ediciones de una foto, con su precio. Los precios del menú los
 * calcula el servidor (precios.ts) y son solo informativos: al "Estimar" el
 * servidor vuelve a calcular y es ese monto el que se confirma (regla dura #3).
 */
export function MenuFoto({
  foto,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  motores,
  motorPorDefecto,
  menuPorMotor,
}: {
  foto: FotoVista
  puedeEditar: boolean
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motores: readonly MotorImagen[]
  motorPorDefecto: string
  /** Menú con precio por imagen (tope, con la foto de entrada) para cada motor. */
  menuPorMotor: Readonly<Record<string, readonly ItemMenuFoto[]>>
}) {
  const [edicion, setEdicion] = useState<IdEdicion>('fondo_estudio')
  const [aspecto, setAspecto] = useState<AspectoFoto>('4:5')
  const [motor, setMotor] = useState(motorPorDefecto)
  const [cantidad, setCantidad] = useState(1)
  const { fase, estimacion, error, costoReal, pedirEstimacion, confirmar, descartar } = usarCompuerta(apagado)

  const menu = menuPorMotor[motor] ?? []
  const restante = topeUsd === null ? null : Math.max(0, topeUsd - gastadoUsd)
  const corriendo = fase === 'corriendo'

  return (
    <div className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3">
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

      <fieldset className="space-y-2" disabled={corriendo}>
        <legend className="mb-1 text-sm font-medium">¿Qué querés hacer con esta foto?</legend>
        {menu.map((item) => (
          <label
            key={item.edicion}
            className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-(--color-borde) px-3 py-2 text-sm"
          >
            <span className="flex items-start gap-2">
              <input
                type="radio"
                name={`edicion-${foto.id}`}
                checked={edicion === item.edicion}
                disabled={!puedeEditar}
                onChange={() => {
                  setEdicion(item.edicion)
                  descartar()
                }}
                className="mt-1"
                aria-label={EDICIONES_FOTO[item.edicion].nombre}
              />
              <span>
                <span className="block">{item.nombre}</span>
                <span className="block text-xs text-(--color-tenue)">{item.descripcion}</span>
              </span>
            </span>
            <span className="text-xs whitespace-nowrap text-(--color-tenue) tabular-nums">
              hasta {formatearUsd(item.porImagenUsd)} por imagen
            </span>
          </label>
        ))}
      </fieldset>

      {puedeEditar && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Formato
              <select
                aria-label="Formato"
                className={campo}
                value={aspecto}
                disabled={corriendo}
                onChange={(e) => {
                  setAspecto(e.target.value as AspectoFoto)
                  descartar()
                }}
              >
                {(Object.keys(ASPECTOS_FOTO) as AspectoFoto[]).map((a) => (
                  <option key={a} value={a}>
                    {ASPECTOS_FOTO[a]} ({a})
                  </option>
                ))}
              </select>
            </label>
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

          <button
            type="button"
            className={boton}
            disabled={apagado !== null || fase !== 'libre'}
            onClick={() => void pedirEstimacion(() => postEstimacionFoto({ fotoId: foto.id, edicion, aspecto, motor, cantidad }))}
          >
            Estimar
          </button>

          {estimacion && (
            <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
              <p className="text-sm">
                {estimacion.datos.cantidad} × ~{formatearUsd(estimacion.datos.porImagenUsd)} (precio de lista{' '}
                {formatearUsd(estimacion.datos.listaUsd)}). El tope incluye la foto que se manda, el pensamiento y la entrada del
                modelo; el costo real puede ser menor.
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
  )
}
