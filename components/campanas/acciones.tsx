'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanVista } from '@/lib/estratega/tipos'
import { patchPlan } from './api'
import { Editor } from './editor'

const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * OK / Editar / Descartar sobre la ÚLTIMA versión. El rol solo decide qué botones
 * se ven: el endpoint sigue siendo la autoridad (un lector igual recibiría 403).
 */
export function Acciones({
  vista,
  puedeEditar,
  esPunta,
}: {
  vista: PlanVista
  puedeEditar: boolean
  esPunta: boolean
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  // El estado se actualiza después del render: la ref corta un doble click inmediato.
  const enCurso = useRef(false)

  const accionable = esPunta && (vista.estado === 'borrador' || vista.estado === 'aprobado')
  if (!accionable) return null
  if (!puedeEditar) {
    return <p className="text-sm text-(--color-tenue)">Solo lectura: tu rol no permite aprobar ni editar planes.</p>
  }

  async function actuar(accion: 'aprobar' | 'descartar') {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    const r = await patchPlan(vista.id, { accion, version: vista.version })
    enCurso.current = false
    setCargando(false)
    if (r.ok) {
      router.refresh()
      return
    }
    setError(r.error)
    // 409: alguien más cambió el plan; se recarga para mostrar lo vigente.
    if (r.status === 409) router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {vista.estado === 'borrador' && (
          <button type="button" className={boton} disabled={cargando} onClick={() => actuar('aprobar')}>
            OK
          </button>
        )}
        <button type="button" className={boton} disabled={cargando} onClick={() => setEditando(true)}>
          Editar
        </button>
        {vista.estado === 'borrador' && (
          <button type="button" className={boton} disabled={cargando} onClick={() => actuar('descartar')}>
            Descartar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {editando && <Editor vista={vista} onCerrar={() => setEditando(false)} />}
    </div>
  )
}
