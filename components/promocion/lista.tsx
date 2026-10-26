import Link from 'next/link'
import type { ItemLista } from '@/lib/promocion/pantalla'
import { boton } from './ui'

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

const enlaceDiscreto = 'text-sm text-(--color-tenue) underline underline-offset-2 hover:opacity-70'

/** `hijaDeTanda`: el camino principal es la tanda, así que los links de la hija quedan discretos. */
function Tarjeta({ x, soloVer, hijaDeTanda = false }: { x: ItemLista; soloVer: boolean; hijaDeTanda?: boolean }) {
  const aprobada = x.estado === 'aprobada'
  const clase = hijaDeTanda ? enlaceDiscreto : boton
  return (
    <li className="flex gap-3 rounded-lg border border-(--color-borde) p-3">
      {x.miniatura ? (
        <img src={x.miniatura} alt={`Miniatura de ${x.modelo}`} loading="lazy" className="h-24 w-20 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-24 w-20 shrink-0 rounded-md border border-dashed border-(--color-borde)" aria-hidden />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{x.modelo}</p>
        <p className="text-sm text-(--color-tenue)">{x.marca}</p>
        <p className="text-sm tabular-nums">{x.precio}</p>
        {hijaDeTanda && <p className="text-xs font-semibold">{aprobada ? 'Aprobada' : `En el paso ${x.pasoActual}`}</p>}
        <p className="text-xs text-(--color-tenue)">{fecha(x.actualizadoEn)}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {aprobada || soloVer ? (
            <Link href={`/promocionar/${x.id}?paso=${x.pasoActual}`} className={clase}>
              Ver
            </Link>
          ) : (
            <Link href={`/promocionar/${x.id}?paso=${x.pasoActual}`} className={clase}>
              {hijaDeTanda ? 'Retocar solo esta' : `Seguir en el paso ${x.pasoActual}`}
            </Link>
          )}
          {aprobada && x.descarga && (
            <a href={x.descarga} className={clase}>
              Descargar imagen
            </a>
          )}
        </div>
      </div>
    </li>
  )
}

type Tanda = { tipo: 'tanda'; id: string; items: ItemLista[] }
type Entrada = { tipo: 'suelta'; item: ItemLista } | Tanda

/** Junta las hijas de cada tanda en la posición de la primera; el resto queda como está. */
function agruparPorTanda(items: readonly ItemLista[]): Entrada[] {
  const salida: Entrada[] = []
  const tandas = new Map<string, Tanda>()
  for (const x of items) {
    if (x.tandaId === null) {
      salida.push({ tipo: 'suelta', item: x })
      continue
    }
    const t = tandas.get(x.tandaId)
    if (t) t.items.push(x)
    else {
      const nueva: Tanda = { tipo: 'tanda', id: x.tandaId, items: [x] }
      tandas.set(x.tandaId, nueva)
      salida.push(nueva)
    }
  }
  return salida
}

/** Una tanda está "en preparación" mientras al menos una hija sea borrador; si no, va entre las aprobadas. */
const enPreparacion = (e: Entrada) => (e.tipo === 'suelta' ? e.item.estado === 'borrador' : e.items.some((x) => x.estado === 'borrador'))

function GrupoTanda({ t, soloVer }: { t: Tanda; soloVer: boolean }) {
  const n = t.items.length
  const marcas = `${n} ${n === 1 ? 'marca' : 'marcas'}`
  const aprobadas = t.items.filter((x) => x.estado === 'aprobada').length
  const modelo = t.items[0]!.modelo
  return (
    <li className="sm:col-span-2">
      <div role="group" aria-label={`Tanda · ${modelo} · ${marcas}`} className="space-y-3 rounded-lg border border-dashed border-(--color-borde) p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">
              {modelo} · {marcas} · {aprobadas} de {n} aprobadas
            </p>
            <p className="text-xs text-(--color-tenue)">Textos, imagen y aprobación para todas las marcas juntas.</p>
          </div>
          <Link href={`/promocionar/tanda/${t.id}`} className={boton}>
            {soloVer ? 'Ver la tanda' : 'Seguir con la tanda'}
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {t.items.map((x) => (
            <Tarjeta key={x.id} x={x} soloVer={soloVer} hijaDeTanda />
          ))}
        </ul>
      </div>
    </li>
  )
}

function Entradas({ entradas, soloVer }: { entradas: readonly Entrada[]; soloVer: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {entradas.map((e) => (e.tipo === 'suelta' ? <Tarjeta key={e.item.id} x={e.item} soloVer={soloVer} /> : <GrupoTanda key={e.id} t={e} soloVer={soloVer} />))}
    </ul>
  )
}

/** Las promociones en preparación y las aprobadas. Sin hooks: la arma el servidor. */
export function ListaPromociones({ borradores, aprobadas, soloVer = false, filtrada = false }: { borradores: readonly ItemLista[]; aprobadas: readonly ItemLista[]; soloVer?: boolean; filtrada?: boolean }) {
  if (borradores.length === 0 && aprobadas.length === 0) {
    return <p className="text-sm text-(--color-tenue)">{filtrada ? 'Ninguna promoción coincide con los filtros.' : 'Todavía no armaste ninguna promoción.'}</p>
  }
  // Se agrupa ANTES de separar por estado: una tanda se muestra una sola vez, con todas sus hijas.
  const entradas = agruparPorTanda([...borradores, ...aprobadas])
  const preparacion = entradas.filter(enPreparacion)
  const cerradas = entradas.filter((e) => !enPreparacion(e))
  return (
    <div className="space-y-8">
      {preparacion.length > 0 && (
        <section aria-labelledby="promos-borradores">
          <h2 id="promos-borradores" className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            En preparación
          </h2>
          <Entradas entradas={preparacion} soloVer={soloVer} />
        </section>
      )}
      {cerradas.length > 0 && (
        <section aria-labelledby="promos-aprobadas">
          <h2 id="promos-aprobadas" className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Aprobadas
          </h2>
          <Entradas entradas={cerradas} soloVer={soloVer} />
        </section>
      )}
    </div>
  )
}
