'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postEstimacionPromocion } from '@/components/creativos/api'
import { CompuertaImagen } from '@/components/imagenes/compuerta-imagen'
import { formatearUsdCorto } from '@/lib/costos/formato'
import { descargar, type DepsDescarga } from '@/lib/descargas/descargar'
import { depsDelNavegador } from '@/lib/descargas/navegador'
import { nombreDeDescarga } from '@/lib/promocion/nombre-descarga'
import type { DetallePromocion } from '@/lib/promocion/pantalla'
import { postFormato, postReverificacion } from './api'
import { EstadoVerificacion } from './estado-verificacion'
import { boton } from './ui'

const FORMATOS = [
  { id: '4:5', nombre: 'Feed 4:5' },
  { id: '1:1', nombre: 'Cuadrado 1:1' },
  { id: '9:16', nombre: 'Historia 9:16' },
] as const
type Formato = (typeof FORMATOS)[number]['id']

/**
 * Los formatos de la copia fiel (ADR-040). El de la promoción se baja gratis. Cada OTRO formato es una imagen nueva que hace (y revisa) la IA:
 * se paga aparte, con la compuerta de siempre (Ver precio → Confirmar). Una imagen ya generada y revisada de ese formato se baja gratis.
 * Si la revisión dice que los textos no coinciden, no se baja: se genera otra. El lector no ve botones que gasten.
 */
export function BotonesFormatosCopia({
  promocionId,
  modelo,
  aspecto,
  formatosExtra,
  puedeEditar,
  apagado,
  topeUsd,
  gastadoUsd,
  motor,
  deps,
}: {
  promocionId: string
  modelo: string
  /** El formato de la promoción (el de su placa). */
  aspecto: Formato
  formatosExtra: DetallePromocion['formatosExtra']
  puedeEditar: boolean
  apagado: string | null
  topeUsd: number | null
  gastadoUsd: number
  motor: string
  deps?: DepsDescarga
}) {
  const router = useRouter()
  const [cargando, setCargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)

  async function bajar(formato: Formato, creativoId?: string) {
    if (enCurso.current) return
    enCurso.current = true
    setCargando(formato)
    setError(null)
    const r = await postFormato(promocionId, { formato, ...(creativoId ? { creativoId } : {}) })
    if (!r.ok || !r.url) setError(r.ok ? 'No se pudo armar la imagen en ese formato.' : r.error)
    else await descargar({ url: r.url, nombre: nombreDeDescarga(modelo, formato) }, deps ?? depsDelNavegador())
    setCargando(null)
    enCurso.current = false
  }

  /** Las imágenes ya generadas de ese formato, la más nueva primero (la lista viene así del servidor). */
  const deEseFormato = (f: Formato) => formatosExtra.filter((e) => e.generacion.aspecto === f).flatMap((e) => e.creativos.map((c) => ({ g: e.generacion, c })))

  return (
    <div className="space-y-4" data-testid="botones-formatos-copia">
      <p className="text-xs text-(--color-tenue)">Cada formato distinto del tuyo es una imagen nueva que hace la IA: se paga aparte.</p>
      {FORMATOS.map((f) => {
        if (f.id === aspecto) {
          return (
            <div key={f.id} className="space-y-1">
              <button type="button" className={boton} disabled={cargando !== null} onClick={() => void bajar(f.id)}>
                {cargando === f.id ? 'Armando…' : `Descargar ${f.nombre} (gratis)`}
              </button>
            </div>
          )
        }
        const hechas = deEseFormato(f.id)
        const lista = hechas.find((x) => x.g.textosVigentes && x.c.verificacion?.estado === 'ok' && x.c.url)
        const ultima = hechas.find((x) => x.c.verificacion) ?? null
        return (
          <div key={f.id} className="space-y-2 rounded-lg border border-(--color-borde) px-3 py-3">
            <p className="text-sm font-medium">{f.nombre}</p>
            {lista ? (
              <button type="button" className={boton} disabled={cargando !== null} onClick={() => void bajar(f.id, lista.c.id)}>
                {cargando === f.id ? 'Armando…' : `Descargar ${f.nombre} (ya generada)`}
              </button>
            ) : (
              <>
                {ultima && ultima.c.verificacion && (
                  <>
                    {ultima.g.textosVigentes === false && <p className="text-xs text-(--color-aviso)">Cambiaste los textos: la imagen que había tiene los anteriores. Generá otra.</p>}
                    <EstadoVerificacion
                      verificacion={ultima.c.verificacion}
                      puedeEditar={puedeEditar}
                      reverificar={async (aceptado) => {
                        const r = await postReverificacion(ultima.c.id, aceptado)
                        if (r.ok) router.refresh()
                        return r
                      }}
                    />
                  </>
                )}
                {puedeEditar && (
                  <CompuertaImagen
                    apagado={apagado}
                    puedeEditar={puedeEditar}
                    etiqueta={ultima ? `Generar otra ${f.nombre} · Ver precio` : `${f.nombre} · Ver precio`}
                    explicacion="Ver precio no cuesta nada: te muestra cuánto sale antes de gastar."
                    topeUsd={topeUsd}
                    gastadoUsd={gastadoUsd}
                    pedir={() => postEstimacionPromocion({ promocionId, motor, cantidad: 1, formato: f.id })}
                    desglose={(d) => `1 imagen + revisión de textos${d.verificacionUsd ? ` (${formatearUsdCorto(d.verificacionUsd, { estimado: true })})` : ''}. El tope incluye todo; el costo real puede ser menor.`}
                    textoCorriendo="Generando y revisando los textos… puede tardar hasta 3 minutos"
                    despuesDeListo="Mirala arriba."
                    alTerminar={() => router.refresh()}
                  />
                )}
              </>
            )}
          </div>
        )
      })}
      {error && (
        <p role="alert" className="text-xs text-(--color-falta)">
          {error}
        </p>
      )}
    </div>
  )
}
