import Link from 'next/link'
import { fechaRelativa, urlLista, type Entrada, type Ver, type VistaLista } from '@/lib/promocion/lista-vista'
import type { FiltrosLista } from '@/lib/promocion/filtros-lista'
import type { ItemLista } from '@/lib/promocion/pantalla'
import { NOMBRES_PASOS } from './stepper'
import { TandaExpandible } from './tanda-expandible'
import { botonPrincipal } from './ui'

const accion = 'inline-flex min-h-9 items-center rounded-md border border-(--color-borde) px-3 py-1 text-sm font-semibold hover:opacity-70'
const enlaceDiscreto = 'block rounded-md px-2 py-1.5 text-sm hover:opacity-70'
/** Una sola grilla para filas y encabezado: en mobile, miniatura + texto + acción; en desktop, una columna por dato. */
const grilla = 'grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[3rem_minmax(0,1.1fr)_minmax(0,1.3fr)_7rem_minmax(0,1.3fr)_6.5rem_auto]'

const estadoLegible = (x: ItemLista) =>
  x.estado === 'aprobada' ? 'Aprobada' : x.estado === 'descartada' ? 'Descartada' : `Paso ${x.pasoActual} de ${NOMBRES_PASOS.length} · ${NOMBRES_PASOS[x.pasoActual - 1] ?? ''}`

function Miniatura({ x }: { x: ItemLista }) {
  return x.miniatura ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta, no optimizable
    <img src={x.miniatura} alt={`Miniatura de ${x.modelo}`} loading="lazy" className="h-12 w-12 shrink-0 rounded-md object-cover" />
  ) : (
    <div className="h-12 w-12 shrink-0 rounded-md border border-dashed border-(--color-borde)" aria-hidden />
  )
}

/** "Más": lo secundario, fuera de la fila. Sin nada que mostrar, no hay menú. */
function Mas({ items }: { items: { texto: string; href: string }[] }) {
  if (items.length === 0) return null
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-(--color-tenue) hover:opacity-70">Más</summary>
      <div className="absolute right-0 z-10 mt-1 min-w-44 rounded-md border border-(--color-borde) bg-(--color-papel) p-1">
        {items.map((i) => (
          <a key={i.texto} href={i.href} className={enlaceDiscreto}>
            {i.texto}
          </a>
        ))}
      </div>
    </details>
  )
}

function Celdas({ modelo, marcas, precio, estado, actualizado }: { modelo: string; marcas: string; precio: string; estado: string; actualizado: string }) {
  // En mobile las celdas se apilan en dos líneas; en desktop cada una es una columna (sm:contents).
  return (
    <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 sm:contents">
      <p className="w-full truncate font-semibold sm:w-auto">{modelo}</p>
      <p className="truncate text-sm text-(--color-tenue)">{marcas}</p>
      <p className="text-sm tabular-nums">{precio}</p>
      <span className="w-full sm:hidden" aria-hidden />
      <p className="text-sm font-medium">{estado}</p>
      <p className="text-xs text-(--color-tenue)">{actualizado}</p>
    </div>
  )
}

function Fila({ x, soloVer, ahora }: { x: ItemLista; soloVer: boolean; ahora: number }) {
  const sigue = x.estado === 'borrador' && !soloVer
  return (
    <li className={`${grilla} border-b border-(--color-borde) px-3 py-2 last:border-b-0`}>
      <Miniatura x={x} />
      <Celdas modelo={x.modelo} marcas={x.marca} precio={x.precio} estado={estadoLegible(x)} actualizado={fechaRelativa(x.actualizadoEn, ahora)} />
      <div className="flex items-center gap-1">
        <Link href={`/promocionar/${x.id}?paso=${x.pasoActual}`} className={accion}>
          {sigue ? 'Seguir' : 'Ver'}
          <span className="sr-only"> {x.modelo}</span>
        </Link>
        <Mas items={x.estado === 'aprobada' && x.descarga ? [{ texto: 'Descargar imagen', href: x.descarga }] : []} />
      </div>
    </li>
  )
}

/** La hija de una tanda: su marca, su estado y "Retocar solo esta" (o "Ver"). */
function SubFila({ x, soloVer, ahora }: { x: ItemLista; soloVer: boolean; ahora: number }) {
  const retocar = x.estado === 'borrador' && !soloVer
  // En un lote la pieza se nombra por su moto o por su texto; en una tanda de marcas, por su marca.
  const nombre = x.tipoTanda === 'motos' ? `Moto ${x.grupo ?? ''} · ${x.modelo} · ${x.marca}` : x.tipoTanda === 'textos' ? `Texto ${x.variante ?? ''}` : x.marca
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
      <div className="min-w-0">
        <p className="truncate text-sm">{nombre}</p>
        <p className="text-xs text-(--color-tenue)">
          {estadoLegible(x)} · {fechaRelativa(x.actualizadoEn, ahora)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Link href={`/promocionar/${x.id}?paso=${x.pasoActual}`} className={enlaceDiscreto + ' underline underline-offset-2'}>
          {retocar ? 'Retocar solo esta' : 'Ver'}
          <span className="sr-only"> {nombre}</span>
        </Link>
        <Mas items={x.estado === 'aprobada' && x.descarga ? [{ texto: 'Descargar imagen', href: x.descarga }] : []} />
      </div>
    </li>
  )
}

function FilaTanda({ t, soloVer, ahora }: { t: Extract<Entrada, { tipo: 'tanda' }>; soloVer: boolean; ahora: number }) {
  const n = t.items.length
  const aprobadas = t.items.filter((x) => x.estado === 'aprobada').length
  const primera = t.items.find((x) => x.miniatura) ?? t.items[0]!
  const terminable = t.items.some((x) => x.estado === 'borrador') && !soloVer
  const delLote = t.tipoTanda !== 'marcas'
  const cabecera = (
    <div className={`${grilla} px-3 py-2`}>
      <Miniatura x={primera} />
      <Celdas
        modelo={delLote ? t.rotulo : primera.modelo}
        marcas={delLote ? `${n} ${n === 1 ? 'placa' : 'placas'}` : `${n} ${n === 1 ? 'marca' : 'marcas'}`}
        precio={t.tipoTanda === 'motos' ? 'Varios precios' : primera.precio}
        estado={`${aprobadas} de ${n} aprobadas`}
        actualizado={fechaRelativa(t.actualizadoEn, ahora)}
      />
      <Link href={`/promocionar/tanda/${t.id}`} className={accion}>
        {terminable ? 'Seguir con la tanda' : 'Ver la tanda'}
        <span className="sr-only"> {primera.modelo}</span>
      </Link>
    </div>
  )
  return (
    <TandaExpandible cabecera={cabecera} cantidad={n} {...(t.tipoTanda === 'motos' ? { rotuloCantidad: `${n === 1 ? 'la placa' : `las ${n} placas`}` } : t.tipoTanda === 'textos' ? { rotuloCantidad: n === 1 ? 'el texto' : `los ${n} textos` } : {})}>
      {t.items.map((x) => (
        <SubFila key={x.id} x={x} soloVer={soloVer} ahora={ahora} />
      ))}
    </TandaExpandible>
  )
}

const ETIQUETAS: Record<Ver, string> = { terminar: 'Para terminar', historial: 'Historial', descartadas: 'Descartadas' }
const VACIO: Record<Ver, string> = {
  terminar: 'No tenés promociones para terminar.',
  historial: 'Todavía no aprobaste ninguna promoción. Cuando apruebes una, queda guardada acá.',
  descartadas: 'No hay promociones descartadas.',
}

/**
 * La lista de promociones (ADR-031): pestañas por URL, una fila por promoción (la tanda es una sola fila
 * que se abre) y páginas. Sin estado propio salvo abrir una tanda: la arma el servidor.
 */
export function ListaPromociones({
  vista,
  ver,
  filtros,
  soloVer = false,
  conFiltros = false,
  truncada = false,
  ahora = Date.now(),
}: {
  vista: VistaLista
  ver: Ver
  filtros: FiltrosLista
  soloVer?: boolean
  /** Hay marca o modelo elegidos: un vacío significa "no coincide", no "no hay". */
  conFiltros?: boolean
  /** La lectura llegó al tope: puede haber promociones más viejas que no están. */
  truncada?: boolean
  ahora?: number
}) {
  const { totales, entradas, pagina, paginas } = vista
  const pestanias = (['terminar', 'historial', 'descartadas'] as const).filter((v) => v !== 'descartadas' || totales.descartadas > 0 || ver === 'descartadas')
  return (
    <div>
      <nav aria-label="Ver promociones" className="mb-4 flex flex-wrap gap-1 border-b border-(--color-borde)">
        {pestanias.map((v) => (
          <Link
            key={v}
            href={urlLista(filtros, v, 1)}
            aria-current={v === ver ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${v === ver ? 'border-(--color-ok) font-semibold' : 'border-transparent text-(--color-tenue) hover:opacity-70'}`}
          >
            {ETIQUETAS[v]} ({totales[v]})
          </Link>
        ))}
      </nav>

      {entradas.length === 0 ? (
        <div className="space-y-3 py-6">
          <p className="text-sm text-(--color-tenue)">{conFiltros ? 'Ninguna promoción coincide con los filtros.' : VACIO[ver]}</p>
          {!conFiltros && !soloVer && ver === 'terminar' && (
            <Link href="/promocionar/nueva" className={`${botonPrincipal} inline-block`}>
              Nueva promoción
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-(--color-borde)">
          <div aria-hidden className={`${grilla} hidden border-b border-(--color-borde) px-3 py-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase sm:grid`}>
            <span />
            <span>Moto</span>
            <span>Marcas</span>
            <span>Precio</span>
            <span>Estado</span>
            <span>Actualizado</span>
            <span className="w-24" />
          </div>
          <ul role="list" aria-label={ETIQUETAS[ver]}>
            {entradas.map((e) => (e.tipo === 'suelta' ? <Fila key={e.item.id} x={e.item} soloVer={soloVer} ahora={ahora} /> : <FilaTanda key={e.id} t={e} soloVer={soloVer} ahora={ahora} />))}
          </ul>
        </div>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3 text-sm">
          {pagina > 1 ? (
            <Link href={urlLista(filtros, ver, pagina - 1)} className={accion}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-(--color-tenue)">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={urlLista(filtros, ver, pagina + 1)} className={accion}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      {truncada && <p className="mt-4 text-xs text-(--color-tenue)">Se muestran las últimas 200 promociones; las más viejas no entran en esta lista.</p>}
    </div>
  )
}
