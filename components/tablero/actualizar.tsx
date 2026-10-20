'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Tipo = { estado: 'ok' | 'parcial' | 'error'; filas: number; resumen: string; error?: string }
type Aviso =
  | { tipo: 'resultado'; publicidad: Tipo; organico: Tipo }
  | { tipo: 'error'; mensaje: string }

const ROTULOS: Record<Tipo['estado'], string> = { ok: 'ok', parcial: 'parcial', error: 'con error' }

/**
 * Pide al servidor que corra las sincronizaciones (el navegador no escribe nada,
 * regla #5). El rol solo decide si se ve el botón: el endpoint manda y un lector
 * igual recibiría 403.
 */
export function ActualizarEstadisticas({ puedeActualizar }: { puedeActualizar: boolean }) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  // El estado se actualiza después del render: la ref corta un doble click inmediato.
  const enCurso = useRef(false)

  if (!puedeActualizar) {
    return <p className="text-sm text-(--color-tenue)">Solo lectura: tu rol no permite actualizar las estadísticas.</p>
  }

  async function actualizar() {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setAviso(null)
    try {
      const r = await fetch('/api/actualizar', { method: 'POST' })
      const datos = (await r.json().catch(() => ({}))) as { error?: string; publicidad?: Tipo; organico?: Tipo }
      if (datos.publicidad && datos.organico) {
        setAviso({ tipo: 'resultado', publicidad: datos.publicidad, organico: datos.organico })
        router.refresh()
      } else {
        // 409 (en curso), 429 (esperá N minutos) y el resto: el servidor ya redactó el mensaje.
        setAviso({ tipo: 'error', mensaje: datos.error ?? 'No se pudo actualizar. Probá de nuevo.' })
      }
    } catch {
      setAviso({ tipo: 'error', mensaje: 'No se pudo actualizar. Revisá tu conexión y probá de nuevo.' })
    } finally {
      enCurso.current = false
      setCargando(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={cargando}
        onClick={actualizar}
        className="rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cargando ? 'Actualizando… (puede tardar unos minutos)' : 'Actualizar estadísticas'}
      </button>

      {aviso?.tipo === 'error' && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {aviso.mensaje}
        </p>
      )}
      {aviso?.tipo === 'resultado' && (
        <ul role="status" className="space-y-1 text-sm text-(--color-tenue)">
          {(
            [
              ['Publicidad', aviso.publicidad],
              ['Publicaciones', aviso.organico],
            ] as const
          ).map(([rotulo, t]) => (
            <li key={rotulo}>
              {rotulo}: {ROTULOS[t.estado]} · {t.resumen}
              {t.error && <span className="ml-1 font-mono text-xs">{t.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
