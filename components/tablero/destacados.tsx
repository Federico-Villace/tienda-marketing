import type {
  CampaniaDestacada,
  DestacadosCampanias,
  DestacadosPublicaciones,
  GrupoCampanias,
  MetricaCampania,
  PublicacionDestacada,
} from '@/lib/datos/destacados'
import type { CampaniaReal } from '@/lib/datos/publicidad'
import { interaccionesDe } from '@/lib/datos/tipos'
import { marcaPorId } from '@/lib/datos/marcas'

const entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const porciento = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 })
const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })

const ars = (n: number) => `ARS ${entero.format(n)}`

const TITULO_METRICA: Record<MetricaCampania, string> = {
  costoPorResultado: 'costo por mensaje o lead',
  costoPorClic: 'costo por clic',
  cpm: 'costo cada mil impresiones',
}

const MUESTRA_METRICA: Record<MetricaCampania, string> = {
  costoPorResultado: 'resultados',
  costoPorClic: 'clics',
  cpm: 'impresiones',
}

const PLATAFORMA = { instagram: 'Instagram', facebook: 'Facebook' } as const

const subtitulo = 'mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const columna = 'rounded-lg border border-(--color-borde) px-4 py-3'

/** Marca visual + texto para lectores de pantalla: el color no es el único canal. */
function Signo({ bueno }: { bueno: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="mr-2 font-semibold">
        {bueno ? '✓' : '✗'}
      </span>
      <span className="sr-only">{bueno ? 'Funcionó: ' : 'No funcionó: '}</span>
    </>
  )
}

function FilaCampania({ d, bueno, metrica }: { d: CampaniaDestacada; bueno: boolean; metrica: MetricaCampania }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
      <span>
        <Signo bueno={bueno} />
        {d.campania.nombre}
      </span>
      <span className="ml-auto tabular-nums text-(--color-tenue)">
        {ars(d.valor)} · {entero.format(d.muestra)} {MUESTRA_METRICA[metrica]}
      </span>
    </li>
  )
}

function FilaSinResultados({ c }: { c: CampaniaReal }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
      <span>
        <Signo bueno={false} />
        {c.nombre}
      </span>
      <span className="ml-auto tabular-nums text-(--color-tenue)">{ars(c.gasto)} sin mensajes ni leads</span>
    </li>
  )
}

function Grupo({ g, titulo }: { g: GrupoCampanias; titulo?: boolean }) {
  return (
    <div>
      {titulo && <h4 className="mt-3 text-xs text-(--color-tenue)">Medidas por {TITULO_METRICA[g.metrica]}</h4>}
      {g.mejores.length > 0 && (
        <ul aria-label={`Campañas que mejor funcionaron, por ${TITULO_METRICA[g.metrica]}`}>
          {g.mejores.map((d) => (
            <FilaCampania key={d.campania.id} d={d} bueno metrica={g.metrica} />
          ))}
        </ul>
      )}
      {(g.sinResultados.length > 0 || g.peores.length > 0) && (
        <ul aria-label={`Campañas que peor funcionaron, por ${TITULO_METRICA[g.metrica]}`}>
          {g.sinResultados.map((c) => (
            <FilaSinResultados key={c.id} c={c} />
          ))}
          {g.peores.map((d) => (
            <FilaCampania key={d.campania.id} d={d} bueno={false} metrica={g.metrica} />
          ))}
        </ul>
      )}
      {g.pocas && g.sinResultados.length === 0 && (
        <p className="py-1 text-sm text-(--color-tenue)">Pocas campañas con muestra suficiente en el período.</p>
      )}
    </div>
  )
}

function Campanias({ d }: { d: DestacadosCampanias | null }) {
  return (
    <div className={columna}>
      <h3 className={subtitulo}>Campañas{d?.principal ? ` · ${TITULO_METRICA[d.principal.metrica]}` : ''}</h3>
      {d === null ? (
        <p className="text-sm text-(--color-tenue)">No se pudo leer la publicidad.</p>
      ) : d.principal === null ? (
        <p className="text-sm text-(--color-tenue)">Pocas campañas con muestra suficiente en el período.</p>
      ) : (
        <>
          <Grupo g={d.principal} />
          {d.otras.map((g) => (
            <Grupo key={g.metrica} g={g} titulo />
          ))}
        </>
      )}
      {d && d.excluidas.cantidad > 0 && (
        <p className="mt-2 text-xs text-(--color-tenue)">
          {d.excluidas.cantidad} {d.excluidas.cantidad === 1 ? 'campaña' : 'campañas'} sin muestra suficiente. {d.excluidas.motivo}.
        </p>
      )}
      <p className="mt-2 text-xs text-(--color-tenue)">
        {d?.atribuidasPorNombre ? 'Atribuidas por el nombre (aproximado). ' : ''}
        El filtro de plataforma no aplica a campañas.
      </p>
    </div>
  )
}

function FilaPublicacion({ d, bueno, conMarca }: { d: PublicacionDestacada; bueno: boolean; conMarca: boolean }) {
  const p = d.publicacion
  const marca = marcaPorId(p.marcaId)?.nombre ?? ''
  const extracto = p.texto.length > 80 ? `${p.texto.slice(0, 80)}…` : p.texto
  const tasa = p.vistas > 0 ? interaccionesDe(p) / p.vistas : 0
  const red = PLATAFORMA[p.plataforma]
  return (
    <li className="py-1.5 text-sm">
      <p>
        <Signo bueno={bueno} />
        <span className="capitalize">{p.tipo}</span> · {fecha.format(p.publicadoEn)}
        {conMarca && marca ? ` · ${marca}` : ''} · {red}
        {extracto ? <span className="text-(--color-tenue)"> · {extracto}</span> : null}
      </p>
      <p className="pl-5 text-xs tabular-nums text-(--color-tenue)">
        {decimal.format(d.indice)}× lo habitual{marca ? ` de ${marca}` : ''} en {red} · {entero.format(p.vistas)} vistas ·{' '}
        {porciento.format(tasa)} de interacción
        {p.permalink && (
          <>
            {' · '}
            <a
              href={p.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-6 items-center underline underline-offset-2"
              aria-label={`Ver en ${red} (abre en una nueva pestaña)`}
            >
              Ver en {red}
            </a>
          </>
        )}
      </p>
    </li>
  )
}

function Publicaciones({ d, conMarca }: { d: DestacadosPublicaciones | null; conMarca: boolean }) {
  const vacio = d !== null && d.mejores.length === 0 && d.peores.length === 0
  return (
    <div className={columna}>
      <h3 className={subtitulo}>Publicaciones · contra lo habitual de su cuenta</h3>
      {d === null || vacio ? (
        <p className="text-sm text-(--color-tenue)">No hay publicaciones con muestra suficiente para comparar.</p>
      ) : (
        <>
          {d.mejores.length > 0 && (
            <ul aria-label="Publicaciones que mejor funcionaron">
              {d.mejores.map((x) => (
                <FilaPublicacion key={x.publicacion.id} d={x} bueno conMarca={conMarca} />
              ))}
            </ul>
          )}
          {d.peores.length > 0 && (
            <ul aria-label="Publicaciones que peor funcionaron">
              {d.peores.map((x) => (
                <FilaPublicacion key={x.publicacion.id} d={x} bueno={false} conMarca={conMarca} />
              ))}
            </ul>
          )}
        </>
      )}
      {d && d.sinComparar > 0 && (
        <p className="mt-2 text-xs text-(--color-tenue)">
          {d.sinComparar} {d.sinComparar === 1 ? 'publicación sin comparar' : 'publicaciones sin comparar'} (cuentas con menos de 5).
        </p>
      )}
      <p className="mt-2 text-xs text-(--color-tenue)">Las historias y las publicaciones de los últimos 3 días no se comparan.</p>
    </div>
  )
}

/** "Lo que funcionó y lo que no": gratis, sin IA, calculado con los umbrales de lib/datos/destacados. */
export function Destacados({
  campanias,
  publicaciones,
  conMarca = false,
}: {
  /** null = no se pudo leer la publicidad. */
  campanias: DestacadosCampanias | null
  /** null = no hay publicaciones en el período. */
  publicaciones: DestacadosPublicaciones | null
  conMarca?: boolean
}) {
  return (
    <section aria-labelledby="destacados-titulo">
      <h2 id="destacados-titulo" className={subtitulo}>
        Lo que funcionó y lo que no
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Campanias d={campanias} />
        <Publicaciones d={publicaciones} conMarca={conMarca} />
      </div>
    </section>
  )
}
