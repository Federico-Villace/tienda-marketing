'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postConfirmarLote, postEjecutar, postEstimacionLote, postLiberarLote, type LoteVista } from '@/components/creativos/api'
import { PedirCambioImagen } from '@/components/imagenes/pedir-cambio-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import { formatearUsd } from '@/lib/estratega/formato'
import { versionesDeImagen } from '@/lib/productor/pantalla'
import { LIMITES_LOTE } from '@/lib/promocion/lote/tipos'
import type { GrupoDeTandaVista, PendienteDeLote, TandaVista } from '@/lib/promocion/tanda/pantalla'
import { enLotes } from './lote'
import { Alerta, boton, botonPrincipal, Estado, tarjetaOpcion } from './ui'

/** Cuántas imágenes se generan a la vez: Gemini no se satura (≤ 4 pedidos en vuelo) y un error no frena a las otras. */
const CONCURRENCIA = 2

type Fase = 'libre' | 'estimando' | 'confirmando' | 'generando'
type Estimacion = { lote: LoteVista; mes: { gastadoUsd: number; topeUsd: number }; excede: boolean; bloqueada: boolean }
type Item = { generacionId: string; grupo: number | null; modelo: string }
type EstadoItem = 'espera' | 'generando' | 'ok' | 'error'

const titulo = 'text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const tieneImagen = (g: GrupoDeTandaVista) => g.escenas.some((e) => e.creativos.some((c) => c.url))
const fallo = (g: GrupoDeTandaVista) => !tieneImagen(g) && g.escenas.some((e) => e.generacion.estado === 'error')

/**
 * Las imágenes de un lote de motos (ADR-032): UNA escena por moto, compartida por las marcas de esa
 * moto. La compuerta de costo (regla dura #3) es la de siempre pero de a N: Ver precio no cuesta nada,
 * "Confirmar US$ X" confirma TODAS o NINGUNA en el servidor y recién ahí se genera, una imagen por
 * pedido, de a 2. Lo confirmado que no se generó (se cerró la pestaña) queda a la vista para generarlo
 * sin costo nuevo o liberarlo.
 */
export function ImagenesLote({
  tanda,
  puede,
  listo,
  aviso,
  apagado,
  topeUsd,
  motor,
  prepararse,
  usarImagen,
}: {
  tanda: TandaVista
  /** Tiene permiso y no hay otra operación en curso. */
  puede: boolean
  /** El diseño y el fondo están elegidos en todas las placas. */
  listo: boolean
  /** Por qué todavía no se puede estimar (o null). */
  aviso: string | null
  /** Por qué no se puede generar (sin clave o sin tope), en castellano, o null. */
  apagado: string | null
  topeUsd: number | null
  motor: string
  /** Aplica lo del formulario que falte antes de estimar. false = no se pudo: no se estima. */
  prepararse: () => Promise<boolean>
  /** Usa esa imagen en las placas en borrador de esa moto. */
  usarImagen: (grupo: number, creativoId: string) => Promise<void>
}) {
  const router = useRouter()
  const [variantes, setVariantes] = useState<1 | 2>(1)
  const [fase, setFase] = useState<Fase>('libre')
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<Record<string, { item: Item; estado: EstadoItem; mensaje: string | null }>>({})
  const enCurso = useRef(false)
  // Las variantes con las que se estimó: la confirmación y el auto-uso van con esas, no con el radio de ahora.
  const pedidas = useRef<1 | 2>(1)

  const grupos = tanda.grupos
  const sinImagen = grupos.filter((g) => !tieneImagen(g))
  const fallidas = grupos.filter(fallo)
  const confirmadas = tanda.pendientes.filter((p) => p.estado === 'confirmada')
  const cortadas = tanda.pendientes.filter((p) => p.estado === 'corriendo')
  const ocupado = fase !== 'libre'
  const activo = puede && !ocupado

  async function verPrecio(soloGrupos?: number[]) {
    if (enCurso.current || apagado) return
    enCurso.current = true
    setFase('estimando')
    setEstimacion(null)
    setError(null)
    setResultado(null)
    pedidas.current = variantes
    const ok = await prepararse()
    if (!ok) {
      enCurso.current = false
      setFase('libre')
      return
    }
    const r = await postEstimacionLote({ tandaId: tanda.tanda.id, variantes, motor, ...(soloGrupos ? { grupos: soloGrupos } : {}) })
    enCurso.current = false
    setFase('libre')
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEstimacion({ lote: r.lote, mes: r.mes, excede: r.excedeTope, bloqueada: false })
  }

  /** Genera cada imagen (de a 2) y va dejando el estado de cada moto. Cada request ya está pagado: solo ejecuta. */
  async function ejecutar(items: Item[]) {
    setFase('generando')
    setProgreso(Object.fromEntries(items.map((i) => [i.generacionId, { item: i, estado: 'espera' as EstadoItem, mensaje: null }])))
    const poner = (id: string, estado: EstadoItem, mensaje: string | null) => setProgreso((p) => ({ ...p, [id]: { ...p[id]!, estado, mensaje } }))
    let costoReal = 0
    const salida = await enLotes(items, CONCURRENCIA, async (it) => {
      poner(it.generacionId, 'generando', null)
      const r = await postEjecutar(it.generacionId)
      if (!r.ok) {
        poner(it.generacionId, 'error', r.error)
        return false
      }
      costoReal += r.generacion.costoRealUsd
      const buenas = r.creativos.filter((c) => c.url && !c.error)
      if (r.generacion.estado !== 'ok' || buenas.length === 0) {
        poner(it.generacionId, 'error', r.generacion.error ?? 'No se pudo generar esta imagen.')
        return false
      }
      poner(it.generacionId, 'ok', null)
      // Con una sola imagen no hay nada que elegir: queda en las placas de esa moto (revisable abajo).
      if (buenas.length === 1 && it.grupo !== null) await usarImagen(it.grupo, buenas[0]!.id)
      return true
    })
    const bien = salida.filter((x) => x === true).length
    setResultado(`Listo: ${bien} de ${items.length} imágenes. Costo real: ${formatearUsd(costoReal)}.`)
    setFase('libre')
    router.refresh()
  }

  async function confirmar() {
    if (enCurso.current || !estimacion || estimacion.excede || estimacion.bloqueada) return
    enCurso.current = true
    setFase('confirmando')
    setError(null)
    const r = await postConfirmarLote(estimacion.lote.id)
    if (!r.ok) {
      enCurso.current = false
      setFase('libre')
      if (r.status === 402) {
        setError(
          r.restanteUsd !== undefined && r.topeUsd !== undefined
            ? `Supera el tope del mes: quedan ${formatearUsd(r.restanteUsd)} de ${formatearUsd(r.topeUsd)}.`
            : r.error,
        )
        setEstimacion({ ...estimacion, bloqueada: true })
        return
      }
      // 409 (ya se confirmó), 410 (venció) y cualquier otro fallo: esa estimación ya no sirve y no se generó nada.
      setError(r.status === 409 ? 'Ya se confirmó (o cambió el lote): no se cobra dos veces. Mirá el estado abajo.' : r.status === 410 ? 'La estimación venció (pasaron más de 15 minutos). Apretá "Ver precio" de nuevo.' : r.error)
      setEstimacion(null)
      if (r.status === 409) router.refresh()
      return
    }
    const modeloDe = new Map(estimacion.lote.items.map((i) => [i.generacionId, i.modelo]))
    setEstimacion(null)
    enCurso.current = false
    await ejecutar(r.items.map((i) => ({ generacionId: i.generacionId, grupo: i.grupo, modelo: modeloDe.get(i.generacionId) ?? '' })))
  }

  async function generarPendientes() {
    if (enCurso.current) return
    enCurso.current = true
    setError(null)
    setResultado(null)
    await ejecutar(confirmadas.map((p: PendienteDeLote) => ({ generacionId: p.generacionId, grupo: p.grupo, modelo: p.modelo })))
    enCurso.current = false
  }

  async function liberar() {
    if (enCurso.current) return
    enCurso.current = true
    setFase('confirmando')
    setError(null)
    let liberadas = 0
    for (const loteId of new Set(confirmadas.map((p) => p.loteId))) {
      const r = await postLiberarLote(loteId)
      if (!r.ok) {
        setError(r.error)
        break
      }
      liberadas += r.liberadas
    }
    enCurso.current = false
    setFase('libre')
    if (liberadas > 0) setResultado(`${plural(liberadas, 'imagen liberada', 'imágenes liberadas')}: ya no cuentan en el tope del mes.`)
    router.refresh()
  }

  const items = estimacion?.lote.items ?? []
  const imagenes = items.length * pedidas.current
  const listaProgreso = Object.values(progreso)
  const hechas = listaProgreso.filter((x) => x.estado === 'ok' || x.estado === 'error').length

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Imágenes: una por moto</h3>
      <p className="text-xs text-(--color-tenue)">Cada moto tiene su imagen y las marcas de esa moto la comparten: se paga una por moto. Ver precio no cuesta nada.</p>
      {apagado && <Estado>{apagado}</Estado>}

      {confirmadas.length > 0 && (
        <div className="space-y-2 rounded-md border border-(--color-aviso) px-3 py-2">
          <p className="text-sm">
            {plural(confirmadas.length, 'imagen paga sin generar', 'imágenes pagas sin generar')} ({confirmadas.map((p) => p.modelo).join(', ')}). Ya cuentan en el tope del mes.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonPrincipal} disabled={!activo || apagado !== null} onClick={() => void generarPendientes()}>
              Generar (sin costo nuevo)
            </button>
            <button type="button" className={boton} disabled={!activo} onClick={() => void liberar()}>
              Liberar
            </button>
          </div>
        </div>
      )}
      {cortadas.length > 0 && (
        <p className="text-xs text-(--color-tenue)">
          {plural(cortadas.length, 'imagen', 'imágenes')} ({cortadas.map((p) => p.modelo).join(', ')}) {cortadas.some((p) => p.interrumpida) ? 'se cortó a mitad de la generación: pedí el precio de nuevo para esas motos.' : 'se está generando (¿en otra pestaña?).'}
        </p>
      )}

      <fieldset disabled={!activo} className="min-w-0 space-y-2">
        <legend className="text-sm font-medium">Variantes por moto</legend>
        <div role="radiogroup" aria-label="Variantes por moto" className="grid gap-2 sm:grid-cols-2">
          {([1, 2] as const).map((v) => (
            <label key={v} className={tarjetaOpcion}>
              <input type="radio" name="lote-variantes" checked={variantes === v} onChange={() => setVariantes(v)} className="mt-1" />
              <span className="font-medium">
                {v} {v === 1 ? 'variante' : 'variantes'}
              </span>
              <span className="text-xs text-(--color-tenue)">{v === 1 ? 'la imagen se usa sola' : 'elegís una por moto'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {!listo && aviso && <p className="text-xs text-(--color-tenue)">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={boton} disabled={!activo || apagado !== null || !listo || estimacion !== null} onClick={() => void verPrecio()}>
          Ver precio{grupos.length > 1 ? ` de las ${grupos.length} motos` : ''}
        </button>
        {fallidas.length > 0 ? (
          <button type="button" className={boton} disabled={!activo || apagado !== null || !listo} onClick={() => void verPrecio(fallidas.map((g) => g.grupo!))}>
            Volver a pedir precio de las fallidas ({fallidas.length})
          </button>
        ) : (
          sinImagen.length > 0 &&
          sinImagen.length < grupos.length && (
            <button type="button" className={boton} disabled={!activo || apagado !== null || !listo} onClick={() => void verPrecio(sinImagen.map((g) => g.grupo!))}>
              Ver precio de las {sinImagen.length} que no tienen imagen
            </button>
          )
        )}
      </div>
      {fase === 'estimando' && <p role="status" className="text-xs text-(--color-tenue)">Calculando el precio…</p>}

      {estimacion && (
        <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2">
          <p className="text-sm">
            {plural(imagenes, 'imagen', 'imágenes')} para {plural(items.length, 'moto', 'motos')}: {formatearUsd(estimacion.lote.costoEstimadoUsd)} en total.
          </p>
          <ul className="space-y-0.5 text-xs text-(--color-tenue)">
            {items.map((i) => (
              <li key={i.generacionId}>
                {i.modelo} · {formatearUsd(i.costoEstimadoUsd)}
              </li>
            ))}
          </ul>
          {topeUsd !== null && (
            <p className="text-xs text-(--color-tenue)">
              Este mes ya se gastaron {formatearUsd(estimacion.mes.gastadoUsd)} de {formatearUsd(topeUsd)}.
            </p>
          )}
          {estimacion.excede && <p className="text-sm text-(--color-falta)">Supera el tope del mes: no se puede confirmar.</p>}
          <button type="button" className={botonPrincipal} disabled={!activo || estimacion.excede || estimacion.bloqueada} onClick={() => void confirmar()}>
            Confirmar {formatearUsd(estimacion.lote.costoEstimadoUsd)} · {plural(imagenes, 'imagen', 'imágenes')} ({items.length} motos × {pedidas.current})
          </button>
          <p className="text-xs text-(--color-tenue)">Recién acá se cobra, todo junto o nada. La estimación vence en 15 minutos.</p>
        </div>
      )}

      {error && <Alerta>{error}</Alerta>}

      {listaProgreso.length > 0 && (
        <div className="space-y-1">
          {fase === 'generando' && (
            <p role="status" className="text-sm">
              Generando {Math.min(hechas + 1, listaProgreso.length)} de {listaProgreso.length}… no cierres esta pantalla.
            </p>
          )}
          <ul className="space-y-0.5 text-xs">
            {listaProgreso.map(({ item, estado, mensaje }) => (
              <li key={item.generacionId} className={estado === 'error' ? 'text-(--color-falta)' : 'text-(--color-tenue)'}>
                {item.modelo || `Moto ${item.grupo ?? ''}`} · {estado === 'espera' ? 'en espera' : estado === 'generando' ? 'generando…' : estado === 'ok' ? 'lista' : (mensaje ?? 'no se pudo generar')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {resultado && fase === 'libre' && <p role="status" className="text-sm font-medium">{resultado}</p>}

      <div className="space-y-4">
        <h4 className={titulo}>Imágenes de cada moto</h4>
        {grupos.map((g) => {
          const creativos = g.escenas.flatMap((e) => e.creativos)
          const n = g.hijaIds.length
          return (
            <section key={g.grupo ?? 0} aria-label={`Imágenes de ${g.modelo}`} className="space-y-2">
              <p className="text-sm font-medium">
                Moto {g.grupo} · {g.modelo}
              </p>
              <VersionesImagen
                versiones={versionesDeImagen(g.escenas.map((e) => e.generacion), creativos)}
                alt={(_c, i) => `Imagen ${i + 1} de ${g.modelo}`}
                puedeEditar={puede}
                vacio="Todavía no tiene imagen."
                usar={{
                  modo: 'accion',
                  etiqueta: `Usar esta imagen en ${n === 1 ? 'la placa' : `las ${n} placas`} de ${g.modelo}`,
                  alUsar: (id) => void usarImagen(g.grupo!, id),
                  bloqueado: !activo || g.grupo === null,
                  dato: (c) => `En uso en ${(c as { usadaEn?: number }).usadaEn ?? 0} de ${plural(n, 'placa', 'placas')}`,
                }}
                accionesDe={(c) =>
                  c.url && g.hijaIds[0] ? (
                    <PedirCambioImagen creativoId={c.id} promocionId={g.hijaIds[0]} puedeEditar={puede} apagado={apagado} topeUsd={topeUsd} gastadoUsd={tanda.gastadoUsd} />
                  ) : null
                }
              />
            </section>
          )
        })}
      </div>
      <p className="text-xs text-(--color-tenue)">Hasta {LIMITES_LOTE.MOTOS} motos por lote.</p>
    </div>
  )
}
