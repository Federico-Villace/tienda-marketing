import Link from 'next/link'
import { formatearVeces, type PublicacionDestacada } from '@/lib/datos/destacados'
import { marcaPorId } from '@/lib/datos/marcas'
import type { Portada as DatosPortada } from '@/lib/home/portada'

const principal =
  'inline-block rounded-md bg-(--color-ok) px-6 py-3 text-base font-semibold text-white transition-opacity hover:opacity-85 dark:text-black'
const enlace = 'underline underline-offset-4 hover:opacity-70'
const RED = { instagram: 'Instagram', facebook: 'Facebook' } as const

const esMayuscula = (w: string) => w === w.toLocaleUpperCase('es') && w !== w.toLocaleLowerCase('es')

/** ≥60% de las letras en mayúscula (con tildes y ñ), mirando solo el arranque del texto. */
function casiTodoMayusculas(muestra: string): boolean {
  const letras = muestra.match(/\p{L}/gu) ?? []
  if (letras.length <= 8) return false
  return letras.filter(esMayuscula).length / letras.length >= 0.6
}

/** Texto de un post para mostrar: sin emojis al inicio, en minúsculas si grita, corto. */
export function textoParaMostrar(crudo: string, max = 60): string {
  let t = crudo.replace(/\s+/g, ' ').trim()
  t = t.replace(/^[^\p{L}\p{N}¿¡"'(]+/u, '')
  if (casiTodoMayusculas(t.slice(0, 60))) {
    const bajo = t.replace(/\p{L}+/gu, (w) => (esMayuscula(w) ? w.toLocaleLowerCase('es') : w))
    t = bajo.replace(/(^|[.!?¿¡]\s*)(\p{L})/gu, (_m, pre: string, c: string) => pre + c.toLocaleUpperCase('es'))
  }
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t
}

function Numero({ d, color, etiqueta }: { d: PublicacionDestacada; color: string; etiqueta: string }) {
  const p = d.publicacion
  const veces = formatearVeces(d.indice)
  const m = /^(más de )(.+)$/.exec(veces)
  const texto = textoParaMostrar(p.texto)
  return (
    <li className="min-w-0">
      <p className={`text-4xl font-semibold tracking-tight sm:text-5xl ${color}`} aria-label={`${etiqueta}: ${veces} lo habitual`}>
        {m && <span className="mr-2 text-lg font-normal text-(--color-tenue) sm:text-xl">{m[1]}</span>}
        {m ? m[2] : veces}
      </p>
      <p className="mt-1 text-sm text-(--color-tenue)">lo habitual</p>
      <p className="mt-3">{texto || 'Sin texto'}</p>
      <p className="mt-1 text-sm text-(--color-tenue)">
        {marcaPorId(p.marcaId)?.nombre ?? ''} · {RED[p.plataforma]}
        {p.permalink && (
          <>
            {' · '}
            <a href={p.permalink} target="_blank" rel="noopener noreferrer" className={enlace}>
              Ver el post
            </a>
          </>
        )}
      </p>
    </li>
  )
}

export function PortadaHome({ datos }: { datos: DatosPortada }) {
  const { placa, resultados, pendientes } = datos
  const hayResultados = Boolean(resultados && (resultados.mejor || resultados.peor))
  return (
    <div className="mt-10">
      <section aria-labelledby="home-promos" className="flex flex-col gap-8 md:flex-row md:items-center md:gap-12">
        <div className="md:w-[45%] md:shrink-0">
          {placa ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta: igual que el resto de la app */}
              <img src={placa.url} alt="Última promoción aprobada" className="mx-auto max-h-[560px] w-auto max-w-full rounded-lg object-contain md:w-full" />
              <figcaption className="mt-3 text-sm text-(--color-tenue)">
                {placa.href ? (
                  <Link href={placa.href} className={enlace}>
                    {placa.pie}
                  </Link>
                ) : (
                  placa.pie
                )}
              </figcaption>
            </figure>
          ) : (
            <div className="flex aspect-[4/5] max-h-[560px] items-center justify-center rounded-lg bg-(--color-borde)/30 px-8 text-center text-(--color-tenue)">
              Acá va a aparecer tu última promoción aprobada
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="home-promos" className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Armá una promoción
          </h2>
          <p className="mt-3 text-lg text-(--color-tenue)">De la foto de la moto a la placa con precio.</p>
          <p className="mt-8">
            <Link href="/promocionar/nueva" className={principal}>
              Armar una promoción →
            </Link>
          </p>
          {pendientes > 0 && (
            <p className="mt-5">
              <Link href="/promocionar" className={`font-semibold ${enlace}`}>
                Tenés {pendientes} {pendientes === 1 ? 'promoción' : 'promociones'} para terminar →
              </Link>
            </p>
          )}
          <p className={pendientes > 0 ? 'mt-2' : 'mt-5'}>
            <Link href="/promocionar" className={`text-sm text-(--color-tenue) ${enlace}`}>
              Ver todas
            </Link>
          </p>
        </div>
      </section>

      <hr className="my-12 border-(--color-borde)" />

      <section aria-labelledby="home-resultados">
        <h2 id="home-resultados" className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          Este mes
        </h2>
        {hayResultados && resultados ? (
          <ul className="mt-6 grid gap-10 sm:grid-cols-2">
            {resultados.mejor && <Numero d={resultados.mejor} color="text-(--color-ok)" etiqueta="Lo que mejor funcionó" />}
            {resultados.peor && <Numero d={resultados.peor} color="text-(--color-aviso)" etiqueta="Lo que menos funcionó" />}
          </ul>
        ) : (
          <p className="mt-3 text-(--color-tenue)">Qué funcionó, qué no y qué hacer.</p>
        )}
        <p className="mt-8 sm:text-right">
          <Link href="/tablero" className={`font-semibold ${enlace}`}>
            Ver resultados →
          </Link>
        </p>
      </section>
    </div>
  )
}
