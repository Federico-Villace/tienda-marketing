'use client'

import { useRef, useState } from 'react'
import { descargar, type DepsDescarga } from '@/lib/descargas/descargar'
import { depsDelNavegador } from '@/lib/descargas/navegador'
import { nombreDeDescarga } from '@/lib/promocion/nombre-descarga'
import { postFormato } from './api'
import { boton } from './ui'

const FORMATOS = [
  { id: '4:5', nombre: 'Feed vertical 4:5' },
  { id: '1:1', nombre: 'Cuadrado 1:1' },
  { id: '9:16', nombre: 'Historia 9:16' },
] as const

/**
 * Las plantillas de diseño se bajan en los tres formatos sin generar nada de nuevo: la moto ya está, solo se
 * recoloca el diseño (gratis). Un click manda UN pedido; el botón queda deshabilitado mientras arma la imagen.
 */
export function BotonesFormatos({ promocionId, modelo, deps }: { promocionId: string; modelo: string; deps?: DepsDescarga }) {
  const [cargando, setCargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)

  async function bajar(formato: (typeof FORMATOS)[number]['id']) {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(formato)
    setError(null)
    const r = await postFormato(promocionId, { formato })
    if (!r.ok || !r.url) setError(r.ok ? 'No se pudo armar la imagen en ese formato.' : r.error)
    else await descargar({ url: r.url, nombre: nombreDeDescarga(modelo, formato) }, deps ?? depsDelNavegador())
    setCargando(null)
    enCurso.current = false
  }

  return (
    <div className="space-y-2" data-testid="botones-formatos">
      <p className="text-xs text-(--color-tenue)">Bajá la misma imagen en otro formato (gratis, no genera nada nuevo).</p>
      <div className="flex flex-wrap gap-2">
        {FORMATOS.map((f) => (
          <button key={f.id} type="button" className={boton} disabled={cargando !== null} onClick={() => void bajar(f.id)}>
            {cargando === f.id ? 'Armando…' : `Descargar ${f.nombre}`}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-(--color-falta)">
          {error}
        </p>
      )}
    </div>
  )
}
