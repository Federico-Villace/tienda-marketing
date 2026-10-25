import Link from 'next/link'
import type { ItemLista } from '@/lib/promocion/pantalla'
import { boton } from './ui'

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })

function Tarjeta({ x, soloVer }: { x: ItemLista; soloVer: boolean }) {
  const aprobada = x.estado === 'aprobada'
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
        <p className="text-xs text-(--color-tenue)">{fecha(x.actualizadoEn)}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {aprobada || soloVer ? (
            <Link href={`/promocionar/${x.id}?paso=${x.pasoActual}`} className={boton}>
              Ver
            </Link>
          ) : (
            <Link href={`/promocionar/${x.id}?paso=${x.pasoActual}`} className={boton}>
              Seguir en el paso {x.pasoActual}
            </Link>
          )}
          {aprobada && x.descarga && (
            <a href={x.descarga} className={boton}>
              Descargar imagen
            </a>
          )}
        </div>
      </div>
    </li>
  )
}

/** Las promociones en preparación y las aprobadas. Sin hooks: la arma el servidor. */
export function ListaPromociones({ borradores, aprobadas, soloVer = false }: { borradores: readonly ItemLista[]; aprobadas: readonly ItemLista[]; soloVer?: boolean }) {
  if (borradores.length === 0 && aprobadas.length === 0) {
    return <p className="text-sm text-(--color-tenue)">Todavía no armaste ninguna promoción.</p>
  }
  return (
    <div className="space-y-8">
      {borradores.length > 0 && (
        <section aria-labelledby="promos-borradores">
          <h2 id="promos-borradores" className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            En preparación
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {borradores.map((x) => (
              <Tarjeta key={x.id} x={x} soloVer={soloVer} />
            ))}
          </ul>
        </section>
      )}
      {aprobadas.length > 0 && (
        <section aria-labelledby="promos-aprobadas">
          <h2 id="promos-aprobadas" className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Aprobadas
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {aprobadas.map((x) => (
              <Tarjeta key={x.id} x={x} soloVer={soloVer} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
