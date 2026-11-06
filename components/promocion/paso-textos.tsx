'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PedirCambioTexto } from '@/components/textos/pedir-cambio-texto'
import { postCambioTexto } from '@/components/textos/api'
import type { TurnoVista } from '@/lib/agentes/conversacion/tipos'
import { LIMITES } from '@/lib/contenidista/limites'
import { versionesDeTexto } from '@/lib/promocion/textos/versiones'
import type { CopyPromo, PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion, postTextos } from './api'
import { BarraAccion } from '@/components/ui/barra-accion'
import { Alerta, boton, botonPrincipal, campo, Estado, tarjetaOpcion, TituloPaso } from './ui'

export type TextosEnPantalla = { id: string; opciones: CopyPromo[]; intento: number; desactualizado: boolean }

/** El cuarto valor marca lo que se puede dejar vacío al escribir a mano. */
const CAMPOS_TEXTO = [
  ['titular', 'Titular', 40, false],
  ['hook', 'Gancho', LIMITES.HOOK, true],
  ['copy', 'Texto del posteo', LIMITES.COPY, false],
  ['cta', 'Llamado a la acción', LIMITES.CTA, true],
  ['altText', 'Descripción de la imagen', LIMITES.ALT, true],
] as const

const igual = (a: CopyPromo, b: CopyPromo | null) => b !== null && JSON.stringify(a) === JSON.stringify(b)
const tienePrecioPendiente = (c: CopyPromo | null) => c !== null && [c.titular, c.hook, c.copy, c.cta, c.altText, ...c.hashtags].some((t) => t.includes('[precio]'))

function Editor({ inicial, alGuardar, alCancelar, guardando }: { inicial: CopyPromo; alGuardar: (c: CopyPromo) => void; alCancelar: () => void; guardando: boolean }) {
  const [c, setC] = useState({ ...inicial, hashtags: inicial.hashtags.join(' ') })
  const poner = (k: keyof typeof c, v: string) => setC((x) => ({ ...x, [k]: v }))
  return (
    <form
      className="space-y-3 rounded-lg border border-(--color-borde) px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        alGuardar({ ...c, hashtags: c.hashtags.split(/\s+/).filter(Boolean) })
      }}
    >
      {CAMPOS_TEXTO.map(([k, nombre, max, opcional]) => (
        <div key={k}>
          <label htmlFor={`texto-${k}`} className="text-sm font-medium">
            {nombre}
          </label>
          {opcional && <span className="ml-2 text-xs text-(--color-tenue)">opcional</span>}
          {k === 'copy' || k === 'altText' ? (
            <textarea id={`texto-${k}`} className={campo} rows={k === 'copy' ? 6 : 2} value={c[k]} onChange={(e) => poner(k, e.target.value)} />
          ) : (
            <input id={`texto-${k}`} className={campo} value={c[k]} onChange={(e) => poner(k, e.target.value)} />
          )}
          <p className={`text-xs tabular-nums ${c[k].length > max ? 'text-(--color-falta)' : 'text-(--color-tenue)'}`}>
            {c[k].length}/{max}
          </p>
        </div>
      ))}
      <div>
        <label htmlFor="texto-hashtags" className="text-sm font-medium">
          Hashtags
        </label>
        <input id="texto-hashtags" className={campo} value={c.hashtags} onChange={(e) => poner('hashtags', e.target.value)} />
        <span className="ml-2 text-xs text-(--color-tenue)">opcional</span>
        <p className="text-xs text-(--color-tenue)">Hasta 8, separados por espacio y cada uno con #.</p>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={botonPrincipal} disabled={guardando || c.titular.trim() === '' || c.copy.trim() === ''}>
          Guardar texto
        </button>
        <button type="button" className={boton} disabled={guardando} onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * Paso 3 · ¿Qué texto querés publicar? Tres opciones del redactor con tu precio; elegís una
 * y la corregís si hace falta. Un click con el precio aproximado en el botón.
 * Elegir manda SOLO el número de opción: el texto sale de lo que guardó el servidor.
 */
export function PasoTextos({
  promocion: inicial,
  textos: textosIniciales,
  habilitado,
  puedeEditar,
  costo,
  conversacion = [],
  costoCambio = '',
}: {
  promocion: PromocionVista
  textos: TextosEnPantalla | null
  habilitado: boolean
  puedeEditar: boolean
  costo: string
  /** Los cambios que ya se pidieron a la IA sobre el texto (versiones). */
  conversacion?: TurnoVista[]
  /** "~US$ 0,001": lo que cuesta cada cambio pedido. */
  costoCambio?: string
}) {
  const router = useRouter()
  const [promocion, setPromocion] = useState(inicial)
  const [textos, setTextos] = useState(textosIniciales)
  const [cargando, setCargando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  // 'editar' parte del texto actual; 'nuevo' arranca vacío (escrito a mano, sin IA, gratis).
  const [editando, setEditando] = useState<'editar' | 'nuevo' | null>(null)
  const enCurso = useRef(false)

  const abierta = promocion.estado === 'borrador'
  const puede = puedeEditar && abierta
  const elegida = textos ? textos.opciones.findIndex((o) => !promocion.copyEditado && igual(o, promocion.copy)) : -1

  async function correr<T extends { ok: boolean }>(accion: () => Promise<T | (T & { ok: false; status: number; error: string; errores?: string[] })>): Promise<T | null> {
    if (enCurso.current) return null
    enCurso.current = true
    setCargando(true)
    setErrores([])
    setConflicto(false)
    const r = (await accion()) as { ok: boolean; status?: number; error?: string; errores?: string[] } & T
    enCurso.current = false
    setCargando(false)
    if (!r.ok) {
      setErrores(r.errores && r.errores.length > 0 ? r.errores : [r.error ?? 'No se pudo completar la acción.'])
      setConflicto(r.status === 409)
      return null
    }
    return r
  }

  async function pedir(otras: boolean) {
    const r = await correr(() => postTextos(promocion.id, { revision: promocion.revision, ...(otras ? { otras: true } : {}) }))
    if (!r || !r.ok) return
    setTextos({ id: r.textos.id, opciones: r.textos.opciones, intento: r.textos.intento, desactualizado: r.textos.desactualizado })
    setPromocion(r.promocion)
    router.refresh()
  }

  async function elegir(n: number) {
    const r = await correr(() => patchPromocion(promocion.id, { revision: promocion.revision, copyOpcion: n }))
    if (!r || !r.ok) return
    setPromocion(r.promocion)
    router.refresh()
  }

  async function guardar(copy: CopyPromo) {
    const conOpcion = editando === 'editar' && (elegida >= 0 || promocion.copyOpcion)
    const r = await correr(() => patchPromocion(promocion.id, { revision: promocion.revision, copy, ...(conOpcion ? { copyOpcion: elegida >= 0 ? elegida + 1 : promocion.copyOpcion } : {}) }))
    if (!r || !r.ok) return
    setPromocion(r.promocion)
    setEditando(null)
    router.refresh()
  }

  return (
    <section>
      <TituloPaso numero={3} pregunta="¿Qué texto querés publicar?" leyenda="Es el posteo con sus hashtags: va en Instagram, debajo de la imagen. Te escribimos 3 opciones con tu precio, o lo escribís vos." />
      <div className="space-y-4">
        {!habilitado && <Estado>Escribir textos está apagada en este momento: falta la clave de OpenAI. Avisale a quien administra el sistema.</Estado>}
        {textos?.desactualizado && <Estado>Cambiaste los datos después de escribir estos textos: pedí otros para que coincidan con el precio y la promo nuevos.</Estado>}
        {tienePrecioPendiente(promocion.copy) && <Estado>Hay un [precio] sin completar en el texto: editalo y escribí el monto.</Estado>}

        {!textos && puedeEditar && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={botonPrincipal} disabled={!habilitado || !puede || cargando} onClick={() => void pedir(false)}>
              Escribir 3 textos · {costo}
            </button>
            {!promocion.copy && !editando && (
              <button type="button" className={boton} disabled={!puede || cargando} onClick={() => setEditando('nuevo')}>
                Escribirlo yo · Gratis
              </button>
            )}
          </div>
        )}
        {cargando && <p role="status" className="text-sm text-(--color-tenue)">Trabajando… puede tardar hasta un minuto.</p>}

        {textos && (
          <fieldset role="radiogroup" disabled={!puede || cargando} className="min-w-0 space-y-2">
            <legend className="mb-1 text-sm font-medium">Opciones</legend>
            {textos.opciones.map((o, i) => (
              <label key={i} className={tarjetaOpcion}>
                <input type="radio" name="opcion" checked={elegida === i} onChange={() => void elegir(i + 1)} className="mt-1" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold">{o.titular}</span>
                  <span className="block text-(--color-tenue)">{o.hook}</span>
                  <span className="block whitespace-pre-wrap">{o.copy}</span>
                  <span className="block text-xs text-(--color-tenue)">{o.hashtags.join(' ')}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {promocion.copy && !editando && (
          <div className="space-y-2">
            {promocion.copyEditado && <p className="text-xs text-(--color-tenue)">Editaste este texto a mano: es el que va a salir.</p>}
            {puede && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={boton} onClick={() => setEditando('editar')}>
                  Editar este texto
                </button>
                {textos && (
                  <button type="button" className={boton} onClick={() => setEditando('nuevo')}>
                    Escribir uno propio · Gratis
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {textos && !promocion.copy && !editando && puede && (
          <button type="button" className={boton} onClick={() => setEditando('nuevo')}>
            Escribir uno propio · Gratis
          </button>
        )}
        {editando === 'editar' && promocion.copy && (
          <Editor key="editar" inicial={promocion.copy} guardando={cargando} alGuardar={(c) => void guardar(c)} alCancelar={() => setEditando(null)} />
        )}
        {editando === 'nuevo' && (
          <Editor
            key="nuevo"
            inicial={{ titular: promocion.titular ?? '', hook: '', copy: '', hashtags: [], cta: '', altText: '' }}
            guardando={cargando}
            alGuardar={(c) => void guardar(c)}
            alCancelar={() => setEditando(null)}
          />
        )}

        {promocion.copy && puede && (
          <PedirCambioTexto
            costo={costoCambio}
            habilitado={habilitado}
            puedeEditar={puede}
            pedir={(instruccion) => postCambioTexto(promocion.id, { instruccion, revision: promocion.revision })}
            alTerminar={() => router.refresh()}
            versiones={versionesDeTexto(conversacion, promocion.copy)}
            alUsar={async (v) => {
              const r = await patchPromocion(promocion.id, { revision: promocion.revision, copy: v.copy })
              if (!r.ok) return { ok: false, status: r.status, error: r.errores && r.errores.length > 0 ? r.errores.join(' ') : r.error }
              setPromocion(r.promocion)
              return { ok: true }
            }}
          />
        )}

        {errores.length > 0 && (
          <Alerta>
            {errores.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
            {conflicto && (
              <button type="button" className={`${boton} mt-2`} onClick={() => router.refresh()}>
                Recargar
              </button>
            )}
          </Alerta>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {textos && puede && (
            <button type="button" className={boton} disabled={!habilitado || cargando} onClick={() => void pedir(true)}>
              Pedir otras 3 · {costo}
            </button>
          )}
          {promocion.copy && (
            <BarraAccion>
              <Link href={`/promocionar/${promocion.id}?paso=4`} className={botonPrincipal}>
                Seguir a la imagen
              </Link>
            </BarraAccion>
          )}
        </div>
      </div>
    </section>
  )
}
