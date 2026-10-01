'use client'

import { useMemo, useState } from 'react'
import { MOTORES, estimar } from '@/lib/creativos/motores'

const usd = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DE_IMAGEN = MOTORES.filter((m) => m.tipo === 'imagen')
const DE_VIDEO = MOTORES.filter((m) => m.tipo === 'video')

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
  const [motorImagen, setMotorImagen] = useState('flux-2-pro')
  const [videos, setVideos] = useState(4)
  const [segundosPorVideo, setSegundos] = useState(8)
  const [motorVideo, setMotorVideo] = useState('runway-gen4-turbo')
  const [confirmado, setConfirmado] = useState(false)

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
        motorImagen: 'nano-banana-pro',
        motorVideo: 'veo-3-1',
      }),
    [imagenes, videos, segundosPorVideo],
  )

  const factor =
    e.totalMin > 0 ? Math.round((premium.totalMin / e.totalMin) * 10) / 10 : 0

  return (
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
                  setConfirmado(false)
                  setImagenes(Number(ev.target.value))
                }}
                className={claseControl}
              />
            </Campo>
            <Campo rotulo="Motor">
              <select
                value={motorImagen}
                onChange={(ev) => {
                  setConfirmado(false)
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
          <div className="grid gap-3 sm:grid-cols-[8rem_8rem_1fr]">
            <Campo rotulo="Cantidad">
              <input
                type="number"
                min={0}
                max={100}
                value={videos}
                onChange={(ev) => {
                  setConfirmado(false)
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
                  setConfirmado(false)
                  setSegundos(Number(ev.target.value))
                }}
                className={claseControl}
              />
            </Campo>
            <Campo rotulo="Motor">
              <select
                value={motorVideo}
                onChange={(ev) => {
                  setConfirmado(false)
                  setMotorVideo(ev.target.value)
                }}
                className={claseControl}
              >
                {DE_VIDEO.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} — USD {m.precioMin}/s
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </section>

        {factor > 1.2 && (
          <p className="text-sm text-(--color-tenue)">
            Con los motores más caros (Nano Banana Pro + Veo 3.1 Standard), este
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
            Estimado. El costo real se registra por job en{' '}
            <code className="font-mono">generaciones</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setConfirmado(true)}
          disabled={e.totalMin === 0 || confirmado}
          className="mt-4 w-full rounded-md border border-current px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmado ? 'Confirmado ✓' : `Confirmar ${usd.format(e.totalMin)}`}
        </button>

        {confirmado && (
          <p className="mt-3 text-xs text-(--color-ok)">
            En la versión real, recién acá arrancan los jobs. Nada se genera
            antes de este click.
          </p>
        )}
      </aside>
    </div>
  )
}
