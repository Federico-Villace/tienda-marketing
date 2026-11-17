import type { ReactNode } from 'react'
import { ROTULOS_LISTA, type Bloque, type SeccionAyuda } from '@/lib/ayuda/contenido'
import { Plegable } from '@/components/ui/plegable'

/** Un texto con **negritas** (los nombres de los botones). No interpreta nada más: el contenido es nuestro, no del usuario. */
export function Texto({ texto }: { texto: string }): ReactNode {
  return texto.split('**').map((trozo, i) => (i % 2 === 1 ? <strong key={i}>{trozo}</strong> : trozo))
}

const titulo = 'mb-1.5 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'

function BloqueAyuda({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case 'parrafo':
      return <p className="text-sm leading-relaxed"><Texto texto={bloque.texto} /></p>
    case 'nota':
      return (
        <p role="note" className="rounded-lg border border-(--color-aviso) px-4 py-2.5 text-sm leading-relaxed">
          <Texto texto={bloque.texto} />
        </p>
      )
    case 'pasos':
      return (
        <div>
          {bloque.titulo && <h4 className="mb-1.5 text-sm font-semibold">{bloque.titulo}</h4>}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-mono marker:text-(--color-tenue)">
            {bloque.items.map((t, i) => (
              <li key={i}>
                <Texto texto={t} />
              </li>
            ))}
          </ol>
        </div>
      )
    case 'puntos':
      return (
        <div>
          {bloque.titulo && <h4 className="mb-1.5 text-sm font-semibold">{bloque.titulo}</h4>}
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-(--color-tenue)">
            {bloque.items.map((t, i) => (
              <li key={i}>
                <Texto texto={t} />
              </li>
            ))}
          </ul>
        </div>
      )
    case 'lista':
      return (
        <div className="rounded-lg border border-(--color-borde) px-4 py-3">
          <h4 className={titulo}>{ROTULOS_LISTA[bloque.lista]}</h4>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed marker:text-(--color-tenue)">
            {bloque.items.map((t, i) => (
              <li key={i}>
                <Texto texto={t} />
              </li>
            ))}
          </ul>
        </div>
      )
    case 'costos':
      return (
        <div>
          {bloque.titulo && <h4 className="mb-1.5 text-sm font-semibold">{bloque.titulo}</h4>}
          <ul className="divide-y divide-(--color-borde) rounded-lg border border-(--color-borde) text-sm">
            {bloque.filas.map(([que, cuanto]) => (
              <li key={que} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span>
                  <Texto texto={que} />
                </span>
                <span className="font-mono text-xs whitespace-nowrap sm:text-right">{cuanto}</span>
              </li>
            ))}
          </ul>
        </div>
      )
  }
}

export function Bloques({ bloques }: { bloques: readonly Bloque[] }) {
  return (
    <div className="space-y-4">
      {bloques.map((b, i) => (
        <BloqueAyuda key={i} bloque={b} />
      ))}
    </div>
  )
}

/** Una sección del manual: título, resumen, lo que siempre se ve y, plegado, el detalle. */
export function SeccionManual({ seccion, numero }: { seccion: SeccionAyuda; numero: number }) {
  return (
    <section id={seccion.id} aria-labelledby={`${seccion.id}-titulo`} className="scroll-mt-6 border-t border-(--color-borde) pt-8">
      <h2 id={`${seccion.id}-titulo`} className="text-xl font-semibold tracking-tight">
        <span className="mr-2 font-mono text-sm font-normal text-(--color-tenue)">{numero}</span>
        {seccion.titulo}
      </h2>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-(--color-tenue)">{seccion.resumen}</p>
      {seccion.bloques.length > 0 && <Bloques bloques={seccion.bloques} />}
      {seccion.plegados && (
        <div className={`space-y-2 ${seccion.bloques.length > 0 ? 'mt-4' : ''}`}>
          {seccion.plegados.map((p) => (
            <Plegable key={p.titulo} titulo={p.titulo}>
              <Bloques bloques={p.bloques} />
            </Plegable>
          ))}
        </div>
      )}
    </section>
  )
}
