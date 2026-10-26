'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LIMITES } from '@/lib/contenidista/limites'
import type { CopyPromo, PromocionVista } from '@/lib/promocion/tipos'
import { patchPromocion, postTextos } from './api'
import { Alerta, boton, botonPrincipal, campo, Estado, tarjetaOpcion, TituloPaso } from './ui'

export type TextosEnPantalla = { id: string; opciones: CopyPromo[]; intento: number; desactualizado: boolean }

const CAMPOS_TEXTO = [
  ['titular', 'Titular', 40],
  ['hook', 'Gancho', LIMITES.HOOK],
  ['copy', 'Texto del posteo', LIMITES.COPY],
  ['cta', 'Llamado a la acción', LIMITES.CTA],
  ['altText', 'Descripción de la imagen', LIMITES.ALT],
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
      {CAMPOS_TEXTO.map(([k, nombre, max]) => (
        <div key={k}>
          <label htmlFor={`texto-${k}`} className="text-sm font-medium">
            {nombre}
          </label>
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
        <p className="text-xs text-(--color-tenue)">De 3 a 8, separados por espacio y cada uno con #.</p>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={botonPrincipal} disabled={guardando}>
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
}: {
  promocion: PromocionVista
  textos: TextosEnPantalla | null
  habilitado: boolean
  puedeEditar: boolean
  costo: string
}) {
  const router = useRouter()
  const [promocion, setPromocion] = useState(inicial)
  const [textos, setTextos] = useState(textosIniciales)
  const [cargando, setCargando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [conflicto, setConflicto] = useState(false)
  const [editando, setEditando] = useState(false)
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
    const r = await correr(() => patchPromocion(promocion.id, { revision: promocion.revision, copy, ...(elegida >= 0 || promocion.copyOpcion ? { copyOpcion: elegida >= 0 ? elegida + 1 : promocion.copyOpcion } : {}) }))
    if (!r || !r.ok) return
    setPromocion(r.promocion)
    setEditando(false)
    router.refresh()
  }

  return (
    <section>
      <TituloPaso numero={3} pregunta="¿Qué texto querés publicar?" leyenda="Te escribimos 3 opciones con tu precio: elegí una y corregila si hace falta." />
      <div className="space-y-4">
        {!habilitado && <Estado>Escribir textos está apagada en este momento: falta la clave de OpenAI. Avisale a quien administra el sistema.</Estado>}
        {textos?.desactualizado && <Estado>Cambiaste los datos después de escribir estos textos: pedí otros para que coincidan con el precio y la promo nuevos.</Estado>}
        {tienePrecioPendiente(promocion.copy) && <Estado>Hay un [precio] sin completar en el texto: editalo y escribí el monto.</Estado>}

        {!textos && puedeEditar && (
          <button type="button" className={botonPrincipal} disabled={!habilitado || !puede || cargando} onClick={() => void pedir(false)}>
            Escribir 3 textos · {costo}
          </button>
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

        {textos && promocion.copy && !editando && (
          <div className="space-y-2">
            {promocion.copyEditado && <p className="text-xs text-(--color-tenue)">Editaste este texto a mano: es el que va a salir.</p>}
            {puede && (
              <button type="button" className={boton} onClick={() => setEditando(true)}>
                Editar este texto
              </button>
            )}
          </div>
        )}
        {editando && promocion.copy && (
          <Editor inicial={promocion.copy} guardando={cargando} alGuardar={(c) => void guardar(c)} alCancelar={() => setEditando(false)} />
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
            <Link href={`/promocionar/${promocion.id}?paso=4`} className={`${botonPrincipal} inline-block`}>
              Seguir a la imagen
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
