import type { Confianza, IdeaVista, ItemVista } from '@/lib/analista/estructurado'
import type { Hecho } from '@/lib/analista/hechos'
import type { AnalisisV4Vista } from '@/lib/analista/estructurado'
import { hrefArmarPromocion } from '@/lib/analista/precarga'
import { conjuntoDeHecho, type CampaniaFila, type Origen } from '@/lib/analista/origen'
import { TablaPublicaciones } from './tabla-publicaciones'

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

const UNIDADES_PREFIJO: Record<string, string> = { ARS: 'ARS ' }

/** El valor SIEMPRE sale del payload (el hecho), nunca del texto del modelo. */
export const textoDeHecho = (h: Hecho): string => {
  const valor = `${UNIDADES_PREFIJO[h.unidad] ?? ''}${numero.format(h.valor)}${UNIDADES_PREFIJO[h.unidad] ? '' : ` ${h.unidad}`}`
  return h.muestra ? `${h.que}: ${valor} (${numero.format(h.muestra.cantidad)} ${h.muestra.unidad})` : `${h.que}: ${valor}`
}

const CONFIANZA: Record<Confianza, string> = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Confianza baja: muestra chica' }

const seccion = 'mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'

const chip = 'rounded-full border border-(--color-borde) px-2 py-0.5 text-xs tabular-nums text-(--color-tenue)'

function TablaCampanias({ filas }: { filas: readonly CampaniaFila[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
      <table aria-label="Campañas detrás del dato" className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
            <th className="px-3 py-2 font-medium">Campaña</th>
            <th className="px-3 py-2 text-right font-medium">Gasto</th>
            <th className="px-3 py-2 text-right font-medium">Resultados</th>
            <th className="px-3 py-2 text-right font-medium">Clics</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.id} className="border-t border-(--color-borde)">
              <td className="px-3 py-2">{c.nombre}</td>
              <td className="px-3 py-2 text-right tabular-nums">ARS {numero.format(c.gasto)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{numero.format(c.resultados)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{numero.format(c.clics)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Un dato de origen; si se sabe qué publicaciones o campañas hay detrás, se despliegan al lado. */
function Dato({ h, origen }: { h: Hecho; origen?: Origen }) {
  const conjunto = origen ? conjuntoDeHecho(h, origen) : null
  if (!conjunto) return <li className={chip}>{textoDeHecho(h)}</li>
  return (
    <li className="has-[details[open]]:basis-full">
      <details>
        <summary className={`${chip} inline-block cursor-pointer hover:opacity-70`}>
          {textoDeHecho(h)} · <span className="underline underline-offset-2">ver cuáles</span>
        </summary>
        <div className="mt-2">
          {conjunto.tipo === 'publicaciones' ? (
            <TablaPublicaciones titulo={`Publicaciones detrás de: ${h.que}`} filas={conjunto.filas} conMarca />
          ) : (
            <TablaCampanias filas={conjunto.filas} />
          )}
        </div>
      </details>
    </li>
  )
}

function Respaldo({ x, origen }: { x: Pick<ItemVista, 'datos' | 'confianza' | 'verificado'>; origen?: Origen }) {
  return (
    <>
      {x.datos.length > 0 && (
        <ul aria-label="Datos de origen" className="mt-1 flex flex-wrap gap-1.5">
          {x.datos.map((h) => (
            <Dato key={h.id} h={h} origen={origen} />
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-(--color-tenue)">
        {CONFIANZA[x.confianza]}
        {!x.verificado && (
          <span role="note" className="ml-2 font-medium text-(--color-falta)">
            ⚠ Revisá esta cifra: no coincide con los datos
          </span>
        )}
      </p>
    </>
  )
}

function Lista({ titulo, items, origen }: { titulo: string; items: readonly ItemVista[]; origen?: Origen }) {
  if (items.length === 0) return null
  return (
    <section aria-label={titulo}>
      <h4 className={seccion}>{titulo}</h4>
      <ul className="space-y-3">
        {items.map((x, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium">{x.accion}</p>
            <p className="text-(--color-tenue)">{x.porque}</p>
            <Respaldo x={x} origen={origen} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Idea({ x, puedeArmar, origen }: { x: IdeaVista; puedeArmar: boolean; origen?: Origen }) {
  const quien = [x.marca, x.modelo].filter(Boolean).join(' · ')
  return (
    <li className="rounded-lg border border-(--color-borde) px-4 py-3 text-sm">
      <p className="font-medium">{x.titulo}</p>
      <p className="text-xs text-(--color-tenue)">{[quien, x.formato, x.momento].filter(Boolean).join(' · ')}</p>
      <p className="mt-1 text-(--color-tenue)">{x.porque}</p>
      <Respaldo x={x} origen={origen} />
      {puedeArmar && (
        <div className="mt-2">
          <a
            href={hrefArmarPromocion(x)}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-2 hover:opacity-70"
          >
            Armar esta promoción →
          </a>
          <p className="text-xs text-(--color-tenue)">Se abre la promoción con esto cargado: no se crea ni se cobra nada hasta que sigas.</p>
        </div>
      )}
    </li>
  )
}

/** El análisis v4: resumen, Hacé / Evitá / Probá y las ideas para armar, cada una con sus datos de origen. */
export function AnalisisEstructurado({
  a,
  puedeArmar,
  origen,
}: {
  a: AnalisisV4Vista
  puedeArmar: boolean
  /** Las publicaciones y campañas del período del análisis: con eso cada dato se puede desplegar. Sin esto, solo se ve el número. */
  origen?: Origen
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{a.resumen}</p>
      <Lista titulo="Hacé" items={a.hace} origen={origen} />
      <Lista titulo="Evitá" items={a.evita} origen={origen} />
      <Lista titulo="Probá" items={a.proba} origen={origen} />
      {a.ideas.length > 0 && (
        <section aria-label="Ideas para armar">
          <h4 className={seccion}>Ideas para armar</h4>
          <ul className="space-y-3">
            {a.ideas.map((x, i) => (
              <Idea key={i} x={x} puedeArmar={puedeArmar} origen={origen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
