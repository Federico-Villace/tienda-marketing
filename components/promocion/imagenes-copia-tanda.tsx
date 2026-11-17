'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { postConfirmarLote, postEjecutar, postEstimacionLote, postLiberarLote, type LoteVista } from '@/components/creativos/api'
import { PedirCambioImagen } from '@/components/imagenes/pedir-cambio-imagen'
import { VersionesImagen } from '@/components/imagenes/versiones-imagen'
import { formatearUsd } from '@/lib/estratega/formato'
import { formatearUsdCorto } from '@/lib/costos/formato'
import { versionesDeImagen, type CreativoVista } from '@/lib/productor/pantalla'
import type { TandaVista } from '@/lib/promocion/tanda/pantalla'
import { postReverificacion } from './api'
import { EstadoVerificacion } from './estado-verificacion'
import { enLotes } from './lote'
import { Alerta, boton, botonPrincipal, Estado } from './ui'

/** Cuántas imágenes se generan a la vez: Gemini no se satura y un error no frena a las otras. */
const CONCURRENCIA = 2

type Fase = 'libre' | 'estimando' | 'confirmando' | 'generando'
type Estimacion = { lote: LoteVista; mes: { gastadoUsd: number; topeUsd: number }; excede: boolean; bloqueada: boolean }
type Item = { generacionId: string; grupo: number | null; etiqueta: string; hijaIds: string[] }
type EstadoItem = 'espera' | 'generando' | 'ok' | 'error'

const titulo = 'text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Las imágenes de la COPIA FIEL de una tanda (ADR-040), sea de marcas, de motos o de textos. Se genera UNA imagen por moto y por juego de
 * textos (las marcas que piden los mismos textos comparten imagen) y cada imagen se revisa sola. Todo entra por la compuerta de lote de
 * siempre (regla dura #3): "Ver precio" no cuesta nada y muestra UN total (imágenes + revisión de los textos de cada variante); "Confirmar"
 * confirma TODAS o NINGUNA en el servidor y recién ahí se genera, una imagen por pedido. Una imagen cuyos textos no coinciden (o que no se
 * pudo revisar) no se puede usar. Lo confirmado que no se generó (se cerró la pestaña) queda a la vista para generarlo sin costo o liberarlo.
 */
export function ImagenesCopiaTanda({
  tanda,
  puede,
  listo,
  aviso,
  apagado,
  topeUsd,
  motor,
  variantes,
  nombreDe,
  prepararse,
  usarEnPiezas,
}: {
  tanda: TandaVista
  /** Tiene permiso y no hay otra operación en curso. */
  puede: boolean
  /** La referencia está elegida y aplicada en todas las piezas. */
  listo: boolean
  aviso: string | null
  apagado: string | null
  topeUsd: number | null
  motor: string
  /** 1 o 2: un lote confirma hasta 2 imágenes por cada una. */
  variantes: number
  /** Cómo se llama cada pieza en pantalla ("Benelli Store Quilmes", "Texto 2"). */
  nombreDe: (promocionId: string) => string
  /** Aplica lo del formulario que falte antes de estimar. false = no se pudo: no se estima. */
  prepararse: () => Promise<boolean>
  /** Pone esa imagen en esas piezas (cada PATCH con su revisión). Devuelve por qué no se pudo, o null si quedó. */
  usarEnPiezas: (promocionIds: string[], creativoId: string) => Promise<string | null>
}) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('libre')
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<Record<string, { item: Item; estado: EstadoItem; mensaje: string | null }>>({})
  const [fallosUso, setFallosUso] = useState<Record<string, string>>({})
  const enCurso = useRef(false)
  // Las variantes con las que se estimó: la confirmación va con esas, no con las del formulario de ahora.
  const pedidas = useRef(variantes)

  const confirmadas = tanda.pendientes.filter((p) => p.estado === 'confirmada')
  const cortadas = tanda.pendientes.filter((p) => p.estado === 'corriendo')
  const ocupado = fase !== 'libre'
  const activo = puede && !ocupado
  const esMotos = tanda.tipo === 'motos'

  const etiquetaDe = (grupo: number | null, modelo: string, hijaIds: readonly string[]) => {
    const quienes = hijaIds.map(nombreDe).join(', ')
    return esMotos && grupo !== null ? `Moto ${grupo} · ${modelo} · ${quienes}` : quienes
  }
  const sirveADe = (generacionId: string) => tanda.escenas.find((e) => e.generacion.id === generacionId)?.sirveA ?? []

  async function verPrecio() {
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
    const r = await postEstimacionLote({ tandaId: tanda.tanda.id, variantes, motor })
    enCurso.current = false
    setFase('libre')
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEstimacion({ lote: r.lote, mes: r.mes, excede: r.excedeTope, bloqueada: false })
  }

  async function usar(hijaIds: string[], creativoId: string, clave: string) {
    let falla: string | null
    try {
      falla = (await usarEnPiezas(hijaIds, creativoId)) ?? null
    } catch {
      falla = 'No se pudo guardar la imagen en las placas.'
    }
    setFallosUso((f) => {
      const { [clave]: _antes, ...resto } = f
      return falla === null ? resto : { ...resto, [clave]: falla }
    })
  }

  /** Genera cada imagen (de a 2). Cada request ya está pagado: solo ejecuta (y revisa los textos). */
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
      // Con una sola imagen no hay nada que elegir: queda en las piezas que piden esos textos, pero SOLO si los textos salieron bien.
      const unica = buenas.length === 1 ? buenas[0]! : null
      if (unica && unica.verificacion?.estado === 'ok' && it.hijaIds.length > 0) await usar(it.hijaIds, unica.id, it.generacionId)
      const mala = buenas.every((c) => c.verificacion?.estado !== 'ok')
      poner(it.generacionId, 'ok', mala ? 'los textos no coinciden o no se pudieron revisar: mirá el detalle abajo' : null)
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
    const deItem = new Map(estimacion.lote.items.map((i) => [i.generacionId, i]))
    setEstimacion(null)
    enCurso.current = false
    await ejecutar(
      r.items.map((i) => {
        const e = deItem.get(i.generacionId)
        const hijaIds = e?.hijaIds ?? []
        return { generacionId: i.generacionId, grupo: i.grupo, hijaIds, etiqueta: etiquetaDe(i.grupo, e?.modelo ?? '', hijaIds) }
      }),
    )
  }

  async function generarPendientes() {
    if (enCurso.current) return
    enCurso.current = true
    setError(null)
    setResultado(null)
    await ejecutar(confirmadas.map((p) => ({ generacionId: p.generacionId, grupo: p.grupo, hijaIds: sirveADe(p.generacionId), etiqueta: etiquetaDe(p.grupo, p.modelo, sirveADe(p.generacionId)) || p.modelo })))
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
  const piezas = new Set(items.flatMap((i) => i.hijaIds ?? [])).size
  const revisionUsd = items.reduce((t, i) => t + (i.verificacionUsd ?? 0), 0)
  const listaProgreso = Object.values(progreso)
  const hechas = listaProgreso.filter((x) => x.estado === 'ok' || x.estado === 'error').length
  const creativos = tanda.escenas.flatMap((e) => e.creativos)

  /** Por qué una imagen NO se puede usar (null = se puede): sin revisar, con textos que no coinciden, de textos viejos o de otra plantilla. */
  const bloqueoDe = (c: CreativoVista, generacionId: string, copiaFiel: boolean | undefined): string | null => {
    if (!copiaFiel) return 'No es de la copia fiel: no se puede usar'
    if (sirveADe(generacionId).length === 0) return 'Ninguna pieza pide estos textos: generá otra'
    if (!c.verificacion || c.verificacion.estado === 'pendiente') return 'Sin revisar todavía: no se puede usar'
    if (c.verificacion.estado === 'error') return 'No se pudieron revisar los textos: no se puede usar'
    return c.verificacion.estado === 'ok' ? null : 'Los textos no coinciden: no se puede usar'
  }

  return (
    <div className="space-y-4" data-testid="imagenes-copia-tanda">
      <h3 className="text-sm font-medium">Imágenes de la copia fiel</h3>
      <p className="text-xs text-(--color-tenue)">
        Se genera una imagen por cada juego de textos distinto (las {esMotos ? 'marcas de una moto' : 'piezas'} que piden los mismos textos comparten imagen) y cada una se revisa sola: los textos tienen que coincidir con lo que cargaste. Ver precio no cuesta nada.
      </p>
      {apagado && <Estado>{apagado}</Estado>}

      {confirmadas.length > 0 && (
        <div className="space-y-2 rounded-md border border-(--color-aviso) px-3 py-2">
          <p className="text-sm">
            {plural(confirmadas.length, 'imagen paga sin generar', 'imágenes pagas sin generar')}. Ya cuentan en el tope del mes.
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
          {plural(cortadas.length, 'imagen', 'imágenes')} {cortadas.some((p) => p.interrumpida) ? 'se cortó a mitad de la generación: pedí el precio de nuevo.' : 'se está generando (¿en otra pestaña?).'}
        </p>
      )}

      {!listo && aviso && <p className="text-xs text-(--color-tenue)">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={boton} disabled={!activo || apagado !== null || !listo || estimacion !== null} onClick={() => void verPrecio()}>
          Ver precio
        </button>
      </div>
      {fase === 'estimando' && <p role="status" className="text-xs text-(--color-tenue)">Calculando el precio…</p>}

      {estimacion && (
        <div className="space-y-2 rounded-md border border-(--color-borde) px-3 py-2" data-testid="total-copia-tanda">
          <p className="text-sm">
            {plural(imagenes, 'imagen', 'imágenes')} + revisión de textos para {plural(piezas, 'pieza', 'piezas')}: {formatearUsdCorto(estimacion.lote.costoEstimadoUsd, { estimado: true })} en total.
          </p>
          <ul className="space-y-0.5 text-xs text-(--color-tenue)">
            {items.map((i) => (
              <li key={i.generacionId}>
                {etiquetaDe(i.grupo, i.modelo, i.hijaIds ?? [])} · {formatearUsdCorto(i.costoEstimadoUsd, { estimado: true })}
              </li>
            ))}
          </ul>
          <p className="text-xs text-(--color-tenue)">
            El total incluye la revisión de los textos de cada imagen ({formatearUsdCorto(revisionUsd, { estimado: true })}). Es un tope: el costo real puede ser menor.
          </p>
          {topeUsd !== null && (
            <p className="text-xs text-(--color-tenue)">
              Este mes ya se gastaron {formatearUsd(estimacion.mes.gastadoUsd)} de {formatearUsd(topeUsd)}.
            </p>
          )}
          {estimacion.excede && <p className="text-sm text-(--color-falta)">Supera el tope del mes: no se puede confirmar.</p>}
          <button type="button" className={botonPrincipal} disabled={!activo || estimacion.excede || estimacion.bloqueada} onClick={() => void confirmar()}>
            Confirmar {formatearUsdCorto(estimacion.lote.costoEstimadoUsd, { estimado: true })} · {plural(imagenes, 'imagen', 'imágenes')} + revisión de textos
          </button>
          <p className="text-xs text-(--color-tenue)">Recién acá se cobra, todo junto o nada. La estimación vence en 15 minutos. Generar y revisar puede tardar varios minutos.</p>
        </div>
      )}

      {error && <Alerta>{error}</Alerta>}

      {listaProgreso.length > 0 && (
        <div className="space-y-1">
          {fase === 'generando' && (
            <p role="status" className="text-sm">
              Generando y revisando los textos de {Math.min(hechas + 1, listaProgreso.length)} de {listaProgreso.length}… no cierres esta pantalla.
            </p>
          )}
          <ul className="space-y-0.5 text-xs">
            {listaProgreso.map(({ item, estado, mensaje }) => (
              <li key={item.generacionId} className={estado === 'error' ? 'text-(--color-falta)' : 'text-(--color-tenue)'}>
                {item.etiqueta || 'Imagen'} · {estado === 'espera' ? 'en espera' : estado === 'generando' ? 'generando…' : estado === 'ok' ? (mensaje ?? 'lista') : (mensaje ?? 'no se pudo generar')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {resultado && fase === 'libre' && <p role="status" className="text-sm font-medium">{resultado}</p>}

      <div className="space-y-3">
        <h4 className={titulo}>Imágenes generadas</h4>
        {Object.entries(fallosUso).map(([id, falla]) => (
          <Alerta key={id}>{`No se pudo poner la imagen en las placas: ${falla} Probá con "Usar esta imagen".`}</Alerta>
        ))}
        <VersionesImagen
          versiones={versionesDeImagen(tanda.escenas.map((e) => e.generacion), creativos)}
          alt={(_c, i) => `Imagen de la copia fiel ${i + 1}`}
          puedeEditar={puede}
          vacio="Todavía no se generó ninguna imagen."
          usar={{
            modo: 'accion',
            etiqueta: 'Usar esta imagen en las piezas que piden estos textos',
            alUsar: (id) => {
              const c = creativos.find((x) => x.id === id)
              const e = c ? tanda.escenas.find((x) => x.generacion.id === c.generacionId) : undefined
              if (e) void usar(e.sirveA ?? [], id, e.generacion.id)
            },
            bloqueado: !activo,
            dato: (c) => {
              const quienes = (tanda.escenas.find((e) => e.generacion.id === c.generacionId)?.sirveA ?? []).map(nombreDe)
              return quienes.length > 0 ? `Sirve a: ${quienes.join(', ')}` : 'No la pide ninguna pieza'
            },
            bloqueoDe: (c, g) => bloqueoDe(c, g.id, g.copiaFiel),
          }}
          accionesDe={(c) => {
            const e = tanda.escenas.find((x) => x.generacion.id === c.generacionId)
            const promocionId = e?.sirveA?.[0]
            return c.url ? (
              <>
                {c.verificacion && (
                  <EstadoVerificacion
                    verificacion={c.verificacion}
                    puedeEditar={puede}
                    bloqueado={ocupado}
                    reverificar={async (aceptado) => {
                      const r = await postReverificacion(c.id, aceptado)
                      if (r.ok) router.refresh()
                      return r
                    }}
                  />
                )}
                {promocionId && <PedirCambioImagen creativoId={c.id} promocionId={promocionId} puedeEditar={puede} apagado={apagado} topeUsd={topeUsd} gastadoUsd={tanda.gastadoUsd} />}
              </>
            ) : null
          }}
        />
      </div>
    </div>
  )
}
