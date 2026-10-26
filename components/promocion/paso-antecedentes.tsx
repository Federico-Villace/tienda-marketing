'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AnalisisVista } from '@/lib/analista/historial'
import { MAX_ANALISIS } from '@/lib/analista/limites'
import type { PromocionVista } from '@/lib/promocion/tipos'
import { FiltrosComunes, type PeriodoFiltro } from '@/components/ui/filtros-comunes'
import { patchAnalisis, postAntecedentes } from './api'
import { Alerta, boton, botonPrincipal, campo, Estado, TituloPaso } from './ui'

const enlaceSecundario = 'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70'

/**
 * Paso 2 · ¿Cómo les fue con esta marca? El Analista mira 90 días de resultados de la marca y,
 * si los hay, del modelo, y escribe qué aprender para esta pieza. Se puede saltear.
 * Un click, con el precio aproximado en el botón (cuesta centésimas de centavo).
 */
export function PasoAntecedentes({
  promocion,
  analisis: inicial,
  marca,
  habilitado,
  puedeEditar,
  costo,
  periodo,
}: {
  promocion: PromocionVista
  analisis: AnalisisVista | null
  marca: string
  /** Hay clave de OpenAI en el servidor (el booleano, nunca el valor). */
  habilitado: boolean
  puedeEditar: boolean
  /** "~US$ 0,002", calculado en el servidor. */
  costo: string
  /** El período de la URL (?desde&hasta), validado en el servidor: el mismo control que /tablero. */
  periodo: PeriodoFiltro
}) {
  const router = useRouter()
  const [analisis, setAnalisis] = useState(inicial)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  const abierta = promocion.estado === 'borrador'
  const siguiente = `/promocionar/${promocion.id}?paso=3`

  async function revisar() {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(true)
    setError(null)
    const r = await postAntecedentes(promocion.id, { desde: periodo.desde, hasta: periodo.hasta })
    enCurso.current = false
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setAnalisis(r.analisis)
    router.refresh()
  }

  async function guardar() {
    if (enCurso.current || !analisis) return
    enCurso.current = true
    setGuardando(true)
    setError(null)
    const r = await patchAnalisis(analisis.id, { version: analisis.version, contenido: texto.trim() })
    enCurso.current = false
    setGuardando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setAnalisis(r.analisis)
    setEditando(false)
    router.refresh()
  }

  return (
    <section>
      <TituloPaso numero={2} pregunta="¿Cómo les fue con esta marca?" leyenda={`Miramos ${marca} del ${analisis?.filtros.desde ? `${analisis.filtros.desde} a ${analisis.filtros.hasta}` : `${periodo.desde} a ${periodo.hasta}`} para aprender qué funcionó antes de escribir.`} />
      <div className="space-y-4">
        {!analisis ? (
          <>
            {puedeEditar && abierta && <FiltrosComunes accion={`/promocionar/${promocion.id}`} ocultos={[['paso', '2']]} periodo={periodo} />}
            {!habilitado && <Estado>Esta función está apagada en este momento: falta la clave de OpenAI. Avisale a quien administra el sistema. Podés seguir sin este paso.</Estado>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={botonPrincipal} disabled={!habilitado || !puedeEditar || !abierta || cargando} onClick={() => void revisar()}>
                Revisar cómo nos fue · {costo}
              </button>
              <Link href={siguiente} className={enlaceSecundario}>
                Seguir sin revisar
              </Link>
            </div>
            {cargando && <p role="status" className="text-sm text-(--color-tenue)">Revisando… puede tardar hasta un minuto.</p>}
          </>
        ) : (
          <>
            {editando ? (
              <div className="space-y-2">
                <label htmlFor="antecedentes-texto" className="text-sm font-medium">
                  Análisis
                </label>
                <textarea id="antecedentes-texto" className={campo} rows={12} maxLength={MAX_ANALISIS} value={texto} onChange={(e) => setTexto(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" className={boton} disabled={guardando || texto.trim() === ''} onClick={() => void guardar()}>
                    Guardar
                  </button>
                  <button type="button" className={boton} disabled={guardando} onClick={() => setEditando(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border border-(--color-borde) px-4 py-3 text-sm whitespace-pre-wrap" aria-label="Análisis de cómo les fue">
                  {analisis.contenido}
                </div>
                <p className="text-xs text-(--color-tenue)">
                  {analisis.version > 1 ? 'Editado a mano. ' : ''}
                  {analisis.desdeCache ? 'Ya estaba hecho con estos mismos datos: no costó nada.' : `Costó US$ ${analisis.costoUsd.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}.`}
                </p>
                {puedeEditar && abierta && (
                  <button
                    type="button"
                    className={boton}
                    onClick={() => {
                      setTexto(analisis.contenido)
                      setEditando(true)
                    }}
                  >
                    Editar
                  </button>
                )}
              </div>
            )}
            {!editando && (
              <Link href={siguiente} className={`${botonPrincipal} inline-block`}>
                Seguir a los textos
              </Link>
            )}
          </>
        )}
        {error && <Alerta>{error}</Alerta>}
      </div>
    </section>
  )
}
