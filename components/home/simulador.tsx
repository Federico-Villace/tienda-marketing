'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { estimar } from '@/lib/creativos/motores'

/**
 * Simulación del flujo completo de los 4 agentes.
 *
 * No llama a ningún modelo: las salidas están escritas a mano. Lo que SÍ es
 * real es el presupuesto del Productor, que sale del mismo estimador testeado
 * que usa la pantalla de creativos.
 *
 * El punto de toda la simulación es mostrar la compuerta: el flujo se FRENA
 * antes de gastar y no sigue hasta que alguien confirma.
 */

const usd = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const PEDIDO_CREATIVOS = {
  imagenes: 6,
  motorImagen: 'flux-2-pro',
  videos: 2,
  segundosPorVideo: 8,
  motorVideo: 'runway-gen4-turbo',
}

const BRIEFS = [
  'Lanzamiento de la nueva Benelli TRK',
  'Campaña de financiación en 12 cuotas',
  'Mes del service: turnos online',
]

type Paso = {
  readonly agente: string
  readonly capa: 1 | 2 | 3
  readonly accion: string
  readonly salida: readonly string[]
  readonly costo: number
  /** El Productor frena acá: no sigue sin confirmación humana. */
  readonly frena?: boolean
}

const PASOS: readonly Paso[] = [
  {
    agente: 'Ingesta',
    capa: 1,
    accion: 'Leyendo 90 días de @999motos desde Postgres',
    salida: [
      '412 publicaciones · 1.284.900 vistas',
      'Sin llamadas a Meta: los datos ya estaban en la base',
    ],
    costo: 0,
  },
  {
    agente: 'Analista',
    capa: 2,
    accion: 'Interpretando agregados (no filas crudas)',
    salida: [
      'Los reels rinden 3,2× más que las fotos.',
      'Jueves y martes son los mejores días; el finde cae 30%.',
      'Los posteos con precio explícito duplican los comentarios.',
    ],
    costo: 0.011,
  },
  {
    agente: 'Estratega',
    capa: 2,
    accion: 'Armando el plan sobre lo que dijo el Analista',
    salida: [
      'Objetivo: 12 unidades en 30 días.',
      'Mensaje: «Salí del colectivo. Tu primera 0km con cuota fija.»',
      '60% Instagram reels · 25% Facebook · 15% email',
    ],
    costo: 0.014,
  },
  {
    agente: 'Contenidista',
    capa: 2,
    accion: 'Escribiendo copys y guiones',
    salida: [
      'Jue 09 · Reel · «¿Cuánto gastás por mes en colectivo?»',
      'Mar 14 · Carrusel · «5 cosas que nadie te cuenta»',
      'Jue 16 · Reel · «Entregamos 3 unidades esta semana»',
    ],
    costo: 0.019,
  },
  {
    agente: 'Productor',
    capa: 3,
    accion: 'Cotizando los creativos',
    salida: [
      '6 imágenes · Flux 2 Pro',
      '2 videos de 8s · Runway Gen-4 Turbo',
    ],
    costo: 0,
    frena: true,
  },
]

const COLOR_CAPA: Record<1 | 2 | 3, string> = {
  1: 'text-(--color-tenue)',
  2: 'text-(--color-ok)',
  3: 'text-(--color-aviso)',
}

export function Simulador() {
  const [brief, setBrief] = useState(BRIEFS[0]!)
  const [visibles, setVisibles] = useState(0)
  const [corriendo, setCorriendo] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([])

  const limpiar = useCallback(() => {
    temporizadores.current.forEach(clearTimeout)
    temporizadores.current = []
  }, [])

  useEffect(() => limpiar, [limpiar])

  const presupuesto = estimar(PEDIDO_CREATIVOS)

  const arrancar = () => {
    limpiar()
    setVisibles(0)
    setConfirmado(false)
    setCorriendo(true)

    PASOS.forEach((_, i) => {
      temporizadores.current.push(
        setTimeout(() => {
          setVisibles(i + 1)
          if (i === PASOS.length - 1) setCorriendo(false)
        }, 700 * (i + 1)),
      )
    })
  }

  const gastadoEnTexto = PASOS.slice(0, visibles).reduce(
    (t, p) => t + p.costo,
    0,
  )

  return (
    <div className="rounded-xl border border-(--color-borde) p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tracking-wide text-(--color-tenue) uppercase">
          Pedido
        </span>
        {BRIEFS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              setBrief(b)
              limpiar()
              setVisibles(0)
              setConfirmado(false)
              setCorriendo(false)
            }}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              b === brief
                ? 'border-current font-medium'
                : 'border-(--color-borde) text-(--color-tenue) hover:opacity-70'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={arrancar}
          disabled={corriendo}
          className="rounded-md border border-current px-3.5 py-2 text-sm font-medium disabled:opacity-40"
        >
          {corriendo
            ? 'Trabajando…'
            : visibles > 0
              ? 'Correr de nuevo'
              : 'Ejecutar el equipo'}
        </button>
        {visibles > 0 && (
          <span className="text-xs text-(--color-tenue) tabular-nums">
            Gastado en texto: {usd.format(gastadoEnTexto)}
          </span>
        )}
      </div>

      <ol className="mt-5 space-y-2">
        {PASOS.slice(0, visibles).map((p) => (
          <li
            key={p.agente}
            className="rounded-lg border border-(--color-borde) px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className={`font-mono text-[0.65rem] ${COLOR_CAPA[p.capa]}`}>
                CAPA {p.capa}
              </span>
              <span className="text-sm font-semibold">{p.agente}</span>
              <span className="text-xs text-(--color-tenue)">{p.accion}</span>
              <span className="flex-1" />
              <span className="font-mono text-xs text-(--color-tenue)">
                {p.costo === 0 ? '—' : usd.format(p.costo)}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {p.salida.map((linea) => (
                <li key={linea} className="text-sm text-(--color-tenue)">
                  {linea}
                </li>
              ))}
            </ul>

            {p.frena && (
              <div className="mt-3 rounded-lg border border-(--color-aviso) px-3.5 py-3">
                <p className="text-xs tracking-wide text-(--color-aviso) uppercase">
                  ⛔ Compuerta de costo
                </p>
                <p className="mt-1.5 text-sm">
                  Generar esto cuesta{' '}
                  <strong className="tabular-nums">
                    {usd.format(presupuesto.totalMin)}
                  </strong>
                  . El flujo no sigue hasta que una persona confirme.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmado(true)}
                  disabled={confirmado}
                  className="mt-2.5 rounded-md border border-current px-3 py-1.5 text-sm font-medium disabled:opacity-40"
                >
                  {confirmado
                    ? 'Confirmado ✓'
                    : `Confirmar ${usd.format(presupuesto.totalMin)}`}
                </button>

                {confirmado && (
                  <p className="mt-2.5 text-sm text-(--color-ok)">
                    Generando 6 imágenes y 2 videos… Costo real registrado en{' '}
                    <code className="font-mono text-xs">generaciones</code>.
                    Total de la campaña:{' '}
                    <strong className="tabular-nums">
                      {usd.format(gastadoEnTexto + presupuesto.totalMin)}
                    </strong>
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {visibles === 0 && (
        <p className="mt-5 text-sm text-(--color-tenue)">
          Dale a «Ejecutar el equipo» y mirá cómo el pedido pasa por las tres
          capas. Fijate dónde se frena.
        </p>
      )}
    </div>
  )
}
