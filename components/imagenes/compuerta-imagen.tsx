'use client'

import { useState, type ReactNode } from 'react'
import { postEstimacion } from '@/components/creativos/api'
import type { EstimacionVista, ResultadoConfirmacion, ResultadoEstimacion } from '@/components/creativos/api'
import { usarCompuerta } from '@/components/creativos/compuerta-cliente'
import { boton, botonPrincipal } from '@/components/promocion/ui'
import { formatearUsd } from '@/lib/estratega/formato'
import { resumenEscena, type EscenaResumen } from '@/lib/promocion/fondos'

void postEstimacion

/**
 * Lo que gastaste del mes contra el tope. Es el mismo bloque en Promociones y en /creativos:
 * lo primero que se ve antes de gastar (regla dura #3).
 */
export function GastoDelMes({ topeUsd, gastadoUsd }: { topeUsd: number | null; gastadoUsd: number }) {
  const restante = topeUsd === null ? null : Math.max(0, topeUsd - gastadoUsd)
  return (
    <div className="space-y-2" data-testid="gasto-del-mes">
      {topeUsd !== null && restante !== null ? (
        <>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-semibold">{`${formatearUsd(gastadoUsd)} de ${formatearUsd(topeUsd)} este mes`}</span>
            <span className="text-xs text-(--color-tenue)">quedan {formatearUsd(restante)}</span>
          </p>
          <div
            role="meter"
            aria-label="Gasto del mes"
            aria-valuemin={0}
            aria-valuemax={topeUsd}
            aria-valuenow={gastadoUsd}
            className="h-2 overflow-hidden rounded-full border border-(--color-borde)"
          >
            <div className="h-full bg-(--color-ok)" style={{ width: `${topeUsd > 0 ? Math.min(100, (gastadoUsd / topeUsd) * 100) : 0}%` }} />
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold">Gastado este mes: {formatearUsd(gastadoUsd)}</p>
      )}
      <p className="text-xs text-(--color-tenue)">Cada imagen cuesta plata real. Nada se cobra hasta que apretás Confirmar.</p>
    </div>
  )
}

/**
 * LA compuerta de costo de toda imagen (regla dura #3): "Ver precio" estima (gratis, el servidor
 * calcula), se MUESTRA el monto y recién el click en "Confirmar US$ X" gasta. La usan Promociones,
 * /creativos y "Pedile un cambio": una sola, con los mismos textos. El cliente nunca manda un precio.
 */
export function CompuertaImagen({
  pedir,
  antes,
  apagado,
  puedeEditar,
  deshabilitado = false,
  etiqueta = 'Ver precio',
  explicacion = 'Ver precio no cuesta nada: te muestra cuánto sale antes de gastar.',
  seVaAPedir,
  topeUsd,
  gastadoUsd,
  despuesDeListo,
  alTerminar,
  desglose,
  children,
}: {
  /** Hace la estimación (gratis): arma el pedido sin precio. */
  pedir: () => Promise<ResultadoEstimacion>
  /** Algo que tiene que pasar ANTES de estimar (p. ej. guardar lo escrito). Si devuelve false, no se estima. */
  antes?: () => Promise<boolean>
  /** Por qué no se puede generar (sin clave o sin tope), dicho en castellano, o null. */
  apagado: string | null
  puedeEditar: boolean
  deshabilitado?: boolean
  etiqueta?: string
  explicacion?: ReactNode
  /** Con qué se va a pedir (fondo, descripción, inspiración, moto), si se sabe. */
  seVaAPedir?: EscenaResumen | null
  topeUsd: number | null
  gastadoUsd: number
  /** Qué hacer con la imagen terminada ("Mirala abajo en…"). */
  despuesDeListo?: ReactNode
  alTerminar?: (r: Extract<ResultadoConfirmacion, { ok: true }>) => void
  /** Otra frase para el precio (p. ej. una imagen compartida por varias promociones). */
  desglose?: (datos: EstimacionVista) => ReactNode
  /** Avisos propios de la sección que se ven bajo el botón (p. ej. "Primero elegí el diseño"). */
  children?: ReactNode
}) {
  const compuerta = usarCompuerta(apagado, alTerminar)
  const [usada, setUsada] = useState<EscenaResumen | null>(null)
  const [preparando, setPreparando] = useState(false)
  const { estimacion } = compuerta

  async function verPrecio() {
    if (preparando) return
    if (antes) {
      setPreparando(true)
      const ok = await antes()
      setPreparando(false)
      if (!ok) return
    }
    void compuerta.pedirEstimacion(pedir)
  }

  function confirmar() {
    setUsada(estimacion?.datos.escena ?? null)
    void compuerta.confirmar()
  }

  const corriendo = compuerta.fase === 'corriendo'
  const datos: EstimacionVista | undefined = estimacion?.datos

  return (
    <div className="space-y-3" data-testid="compuerta-imagen">
      <p className="text-xs text-(--color-tenue)">{explicacion}</p>
      {apagado && (
        <p role="status" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm text-(--color-aviso)">
          {apagado}
        </p>
      )}
      {seVaAPedir && <p className="text-sm">Se va a pedir con: {resumenEscena(seVaAPedir)}</p>}
      {puedeEditar && (
        <button type="button" className={boton} disabled={apagado !== null || compuerta.fase !== 'libre' || deshabilitado || preparando} onClick={() => void verPrecio()}>
          {etiqueta}
        </button>
      )}
      {children}

      {estimacion && datos && (
        <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
          <p className="text-sm">
            {desglose
              ? desglose(datos)
              : `${datos.cantidad} ${datos.cantidad === 1 ? 'imagen' : 'imágenes'} × ~${formatearUsd(datos.porImagenUsd)} (precio de lista ${formatearUsd(datos.listaUsd)}). El tope incluye el pensamiento y la entrada del modelo; el costo real puede ser menor.`}
          </p>
          {datos.conInspiracion && <p className="text-xs text-(--color-tenue)">Incluye la foto de inspiración.</p>}
          {topeUsd !== null && (
            <p className="text-xs text-(--color-tenue)">
              Este mes ya se gastaron {formatearUsd(gastadoUsd)} de {formatearUsd(topeUsd)}.
            </p>
          )}
          {estimacion.excede && (
            <p className="text-sm text-(--color-falta)">
              Esta generación supera lo que queda del tope mensual: no se puede confirmar. Probá con menos variantes o con un motor más barato.
            </p>
          )}
          <button type="button" className={botonPrincipal} disabled={corriendo || compuerta.fase !== 'libre' || estimacion.excede || estimacion.bloqueada} onClick={confirmar}>
            {corriendo ? 'Generando… hasta 2 min' : `Confirmar ${formatearUsd(datos.costoEstimadoUsd)}`}
          </button>
          {!corriendo && <p className="text-xs text-(--color-tenue)">Recién acá se cobra. La estimación vence en 15 minutos.</p>}
        </div>
      )}
      {compuerta.costoReal !== null && (
        <p role="status" className="text-sm">
          Listo. Costo real: {formatearUsd(compuerta.costoReal)}. {despuesDeListo}
        </p>
      )}
      {compuerta.costoReal !== null && usada && <p className="text-xs text-(--color-tenue)">Se generó con: {resumenEscena(usada)}</p>}
      {compuerta.error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {compuerta.error}
        </p>
      )}
    </div>
  )
}
