'use client'

import { useRef, useState } from 'react'
import { formatearUsdCorto } from '@/lib/costos/formato'
import { mensajeDiferencia } from '@/lib/promocion/copia/comparar'
import type { VerificacionVista } from '@/lib/promocion/copia/tipos'
import { boton, botonPrincipal } from './ui'

export type ResultadoReverificar = { ok: true; verificacion: VerificacionVista; costoUsd: number } | { ok: false; status: number; error: string }

/**
 * Qué dijo la revisión de los textos de UNA imagen de copia fiel (ADR-040). Lo que importa: una imagen cuyos textos no coinciden con lo
 * que cargaste NO se puede usar. Cuando la revisión FALLÓ se puede repetir con su propia compuerta (precio → Confirmar: un click = un
 * pedido); una que dio diferencias no se repite: se genera otra imagen. El lector ve el estado pero ningún botón.
 */
export function EstadoVerificacion({
  verificacion,
  puedeEditar,
  bloqueado = false,
  reverificar,
}: {
  verificacion: VerificacionVista
  puedeEditar: boolean
  bloqueado?: boolean
  /** Hace el pedido con el precio que se vio. */
  reverificar?: (aceptadoUsd: number) => Promise<ResultadoReverificar>
}) {
  const [fase, setFase] = useState<'inicio' | 'confirmar'>('inicio')
  const [revisando, setRevisando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Un doble click no manda dos pedidos: la marca se pone ANTES de que React vuelva a dibujar.
  const enVuelo = useRef(false)

  async function pedir(precio: number) {
    if (enVuelo.current || !reverificar) return
    enVuelo.current = true
    setRevisando(true)
    setError(null)
    try {
      const r = await reverificar(precio)
      if (!r.ok) setError(r.error)
      setFase('inicio')
    } finally {
      enVuelo.current = false
      setRevisando(false)
    }
  }

  const avisos = verificacion.avisos.map((a) => mensajeDiferencia(a, { avisoLogo: true }))
  const precio = verificacion.costoReverificarUsd
  const puedeRepetir = puedeEditar && verificacion.puedeReverificar && precio !== null && reverificar !== undefined

  return (
    <div className="mt-2 space-y-1 text-xs" data-testid="estado-verificacion" data-estado={verificacion.estado}>
      {verificacion.estado === 'ok' && <p className="font-semibold text-(--color-ok)">✓ Textos revisados</p>}
      {verificacion.estado === 'pendiente' && <p role="status">Revisando los textos…</p>}
      {verificacion.estado === 'difiere' && (
        <div role="alert" className="space-y-1 rounded-md border border-(--color-falta) px-2 py-1.5">
          <p className="font-semibold">Los textos no coinciden con lo que cargaste. Esta imagen no se puede usar:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {verificacion.diferencias.map((d, i) => (
              <li key={i}>{mensajeDiferencia(d)}</li>
            ))}
          </ul>
          <p className="text-(--color-tenue)">Generá otra imagen: la IA puede escribirlos bien en otro intento.</p>
        </div>
      )}
      {verificacion.estado === 'error' && (
        <div role="alert" className="space-y-1.5 rounded-md border border-(--color-aviso) px-2 py-1.5">
          <p className="font-semibold">No se pudieron revisar los textos. Hasta que se revisen, no se puede usar esta imagen.</p>
          {puedeRepetir &&
            (fase === 'inicio' ? (
              <button type="button" className={boton} disabled={bloqueado || revisando} onClick={() => setFase('confirmar')}>
                Revisar de nuevo · {formatearUsdCorto(precio!, { estimado: true })}
              </button>
            ) : (
              <div className="space-y-1">
                <p>Volver a revisar cuesta hasta {formatearUsdCorto(precio!, { estimado: true })}. Nada se cobra hasta que confirmes.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={botonPrincipal} disabled={bloqueado || revisando} onClick={() => void pedir(precio!)}>
                    {revisando ? 'Revisando…' : `Confirmar ${formatearUsdCorto(precio!, { estimado: true })}`}
                  </button>
                  <button type="button" className={boton} disabled={revisando} onClick={() => setFase('inicio')}>
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          {error && <p className="text-(--color-falta)">{error}</p>}
        </div>
      )}
      {avisos.length > 0 && verificacion.estado !== 'pendiente' && (
        <ul className="list-disc space-y-0.5 pl-4 text-(--color-tenue)" aria-label="Avisos de la revisión">
          {avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
