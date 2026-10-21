'use client'

import { useMemo, useState } from 'react'
import { MOTORES, buscarMotor, estimar } from '@/lib/creativos/motores'

const usd = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DE_IMAGEN = MOTORES.filter((m) => m.tipo === 'imagen')
const DE_VIDEO = MOTORES.filter((m) => m.tipo === 'video')
const PREMIUM = { imagen: 'gemini-3-pro-image', video: 'sora-2-pro' } as const

function Campo({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs tracking-wide text-(--color-tenue) uppercase">
        {rotulo}
      </span>
      {children}
    </label>
  )
}

const claseControl =
  'w-full rounded-md border border-(--color-borde) bg-transparent px-2.5 py-1.5 text-sm'

export function Compuerta() {
  const [imagenes, setImagenes] = useState(20)
  const [motorImagen, setMotorImagen] = useState('gemini-nano-banana-2.1')
  const [videos, setVideos] = useState(4)
  const [segundosPorVideo, setSegundos] = useState(8)
  const [motorVideo, setMotorVideo] = useState('runway-gen4-turbo')

  const pedido = { imagenes, motorImagen, videos, segundosPorVideo, motorVideo }
  const e = useMemo(() => estimar(pedido), [
    imagenes,
    motorImagen,
    videos,
    segundosPorVideo,
    motorVideo,
  ])

  // El mismo pedido con los motores más caros: el contraste es el argumento.
  const premium = useMemo(
    () =>
      estimar({
        ...pedido,
        motorImagen: PREMIUM.imagen,
        motorVideo: PREMIUM.video,
      }),
    [imagenes, videos, segundosPorVideo],
  )

  const factor =
    e.totalMin > 0 ? Math.round((premium.totalMin / e.totalMin) * 10) / 10 : 0

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Calculadora de volumen (referencia)</h2>
        <p className="mt-1 max-w-2xl text-sm text-(--color-tenue)">
          Sirve para dimensionar un mes de contenido. No genera nada ni confirma nada: la compuerta real está en el
          Productor, arriba.
        </p>
      </header>
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <section className="rounded-lg border border-(--color-borde) p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Imágenes
          </h2>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Campo rotulo="Cantidad">
              <input
                type="number"
                min={0}
                max={500}
                value={imagenes}
                onChange={(ev) => {
                  setImagenes(Number(ev.target.value))
                }}
                className={claseControl}
              />
            </Campo>
            <Campo rotulo="Motor">
              <select
                value={motorImagen}
                onChange={(ev) => {
                  setMotorImagen(ev.target.value)
                }}
                className={claseControl}
              >
                {DE_IMAGEN.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} — USD {m.precioMin}/imagen
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </section>

        <section className="rounded-lg border border-(--color-borde) p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Videos
          </h2>
          <p className="mb-3 text-xs text-(--color-tenue)">Video: referencial, no disponible. Son precios de comparativas.</p>
          <div className="grid gap-3 sm:grid-cols-[8rem_8rem_1fr]">
            <Campo rotulo="Cantidad">
              <input
                type="number"
                min={0}
                max={100}
                value={videos}
                onChange={(ev) => {
                  setVideos(Number(ev.target.value))
                }}
                className={claseControl}
              />
            </Campo>
            <Campo rotulo="Segundos c/u">
              <input
                type="number"
                min={0}
                max={60}
                value={segundosPorVideo}
                onChange={(ev) => {
                  setSegundos(Number(ev.target.value))
                }}
                className={claseControl}
              />
            </Campo>
            <Campo rotulo="Motor">
              <select
                value={motorVideo}
                onChange={(ev) => {
                  setMotorVideo(ev.target.value)
                }}
                className={claseControl}
              >
                {DE_VIDEO.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} — USD {m.precioMin}/s (referencial, no disponible)
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </section>

        {factor > 1.2 && (
          <p className="text-sm text-(--color-tenue)">
            Con los motores más caros ({buscarMotor(PREMIUM.imagen)?.nombre} + {buscarMotor(PREMIUM.video)?.nombre}), este
            mismo pedido saldría{' '}
            <strong className="text-(--color-aviso)">
              {usd.format(premium.totalMin)}
            </strong>{' '}
            — <strong>{factor}×</strong> más. Esa diferencia es la razón de ser
            de esta pantalla.
          </p>
        )}
      </div>

      <aside className="h-fit rounded-lg border border-(--color-borde) p-4 lg:sticky lg:top-6">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Presupuesto
        </h2>

        {e.items.length === 0 ? (
          <p className="text-sm text-(--color-tenue)">Nada pedido todavía.</p>
        ) : (
          <ul className="space-y-2.5">
            {e.items.map((i) => (
              <li key={i.concepto} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{i.concepto}</span>
                  <span className="tabular-nums">{usd.format(i.min)}</span>
                </div>
                <p className="text-xs text-(--color-tenue)">
                  {i.motor} · {i.detalle}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-(--color-borde) pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm">Total</span>
            <span className="text-2xl font-semibold tabular-nums">
              {e.esRango
                ? `${usd.format(e.totalMin)}–${usd.format(e.totalMax)}`
                : usd.format(e.totalMin)}
            </span>
          </div>
          <p className="mt-1 text-xs text-(--color-tenue)">
            Estimado de referencia. El costo real de cada imagen se registra al generar, en{' '}
            <code className="font-mono">generaciones</code>.
          </p>
        </div>


      </aside>
    </div>
    </div>
  )
}
