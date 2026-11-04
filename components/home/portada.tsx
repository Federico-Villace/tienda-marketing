import Link from 'next/link'
import type { PublicacionDestacada } from '@/lib/datos/destacados'
import { marcaPorId } from '@/lib/datos/marcas'
import type { Portada as DatosPortada } from '@/lib/home/portada'

const tarjeta = 'flex flex-col rounded-lg border border-(--color-borde) p-5'
const principal = 'inline-block rounded-md border border-(--color-ok) px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-70'
const discreto = 'text-sm text-(--color-tenue) underline underline-offset-4 hover:opacity-70'
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const RED = { instagram: 'Instagram', facebook: 'Facebook' } as const

function Publicacion({ marca, d }: { marca: '✓' | '✗'; d: PublicacionDestacada }) {
  const p = d.publicacion
  const texto = p.texto.trim().replace(/\s+/g, ' ')
  const corto = texto.length > 70 ? `${texto.slice(0, 70).trimEnd()}…` : texto
  return (
    <li className="flex gap-3 text-sm">
      <span aria-label={marca === '✓' ? 'Funcionó' : 'No funcionó'} className={marca === '✓' ? 'text-(--color-ok)' : 'text-(--color-falta)'}>
        {marca}
      </span>
      <div className="min-w-0">
        <p className="truncate">{corto || 'Sin texto'}</p>
        <p className="text-xs text-(--color-tenue)">
          {marcaPorId(p.marcaId)?.nombre ?? ''} · {RED[p.plataforma]} · {decimal.format(d.indice)}× lo habitual
          {p.permalink && (
            <>
              {' · '}
              <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-70">
                Ver el post
              </a>
            </>
          )}
        </p>
      </div>
    </li>
  )
}

export function PortadaHome({ datos }: { datos: DatosPortada }) {
  const { placa, resultados, pendientes } = datos
  const hayResultados = Boolean(resultados && (resultados.mejor || resultados.peor))
  return (
    <>
      <div className="space-y-5">
        <section aria-labelledby="home-promos" className={`${tarjeta} gap-6 sm:flex-row sm:items-center`}>
          <div className="sm:w-2/5 sm:shrink-0">
            {placa ? (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta: igual que el resto de la app */}
                <img
                  src={placa.url}
                  alt="Placa de una promoción"
                  className="mx-auto max-h-[420px] w-auto max-w-full rounded-md border border-(--color-borde) object-contain sm:w-full"
                />
                <figcaption className="mt-2 text-xs text-(--color-tenue)">
                  {placa.href ? (
                    <Link href={placa.href} className="underline underline-offset-2 hover:opacity-70">
                      {placa.pie}
                    </Link>
                  ) : (
                    placa.pie
                  )}
                </figcaption>
              </figure>
            ) : (
              <div className="flex aspect-[4/5] max-h-[420px] items-center justify-center rounded-md border border-dashed border-(--color-borde) px-6 text-center text-sm text-(--color-tenue)">
                Acá va a aparecer tu última promoción aprobada
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="home-promos" className="text-xl font-semibold">
              Promociones
            </h2>
            <p className="mt-1 text-(--color-tenue)">De la foto de la moto a la placa con precio, en 6 pasos.</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/promocionar/nueva" className={principal}>
                Armar una promoción →
              </Link>
              <Link href="/promocionar" className={discreto}>
                Ver todas
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="home-resultados" className="rounded-lg border border-(--color-borde) p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <div>
              <h2 id="home-resultados" className="text-xl font-semibold">
                Resultados y análisis
              </h2>
              <p className="mt-1 text-(--color-tenue)">Qué funcionó, qué no y qué hacer.</p>
            </div>
            <Link href="/tablero" className={principal}>
              Ver resultados →
            </Link>
          </div>
          {hayResultados && resultados && (
            <ul className="mt-4 grid gap-4 border-t border-(--color-borde) pt-4 sm:grid-cols-2">
              {resultados.mejor && <Publicacion marca="✓" d={resultados.mejor} />}
              {resultados.peor && <Publicacion marca="✗" d={resultados.peor} />}
            </ul>
          )}
        </section>
      </div>

      {pendientes > 0 && (
        <p className="mt-8">
          <Link href="/promocionar" className="text-sm font-semibold underline underline-offset-4 hover:opacity-70">
            Tenés {pendientes} {pendientes === 1 ? 'promoción' : 'promociones'} para terminar →
          </Link>
        </p>
      )}
    </>
  )
}
