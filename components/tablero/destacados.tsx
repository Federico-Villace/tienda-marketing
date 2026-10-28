import type { DestacadosCampanias, DestacadosPublicaciones, GrupoCampanias, MetricaCampania } from '@/lib/datos/destacados'
import type { ReactNode } from 'react'
import { partir, UMBRALES } from '@/lib/datos/destacados'
import { aPostFila } from '@/lib/analista/origen'
import { TablaPublicaciones } from './tabla-publicaciones'

const entero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

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

const subtitulo = 'mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase'
const lado = 'mt-4 mb-1 text-sm font-medium'

/** Una fila de la tabla de campañas: `valor` null = gastó sin traer mensajes ni leads. */
type FilaCampania = { readonly id: string; readonly nombre: string; readonly valor: number | null; readonly muestra: number | null; readonly gasto: number }

function TablaCampanias({ titulo, filas, metrica }: { titulo: string; filas: readonly FilaCampania[]; metrica: MetricaCampania }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-(--color-borde)">
      <table aria-label={titulo} className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-(--color-borde) text-left text-xs text-(--color-tenue)">
            <th className="px-3 py-2 font-medium">Campaña</th>
            <th className="px-3 py-2 text-right font-medium">{TITULO_METRICA[metrica]}</th>
            <th className="px-3 py-2 text-right font-medium">Muestra</th>
            <th className="px-3 py-2 text-right font-medium">Gasto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-t border-(--color-borde)">
              <td className="px-3 py-2.5">{f.nombre}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{f.valor === null ? 'Sin mensajes ni leads' : ars(f.valor)}</td>
              <td className="px-3 py-2.5 text-right text-(--color-tenue) tabular-nums">
                {f.muestra === null ? '—' : `${entero.format(f.muestra)} ${MUESTRA_METRICA[metrica]}`}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{ars(f.gasto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Mejores, peores y "Ver todas" con el mismo formato para publicaciones y campañas. */
function VerTodas({ cantidad, children }: { cantidad: number; children: ReactNode }) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm underline underline-offset-2">Ver todas ({cantidad})</summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

function Grupo({ g, titulo }: { g: GrupoCampanias; titulo?: boolean }) {
  const delRanking = (d: GrupoCampanias['ordenadas'][number]): FilaCampania => ({
    id: d.campania.id,
    nombre: d.campania.nombre,
    valor: d.valor,
    muestra: d.muestra,
    gasto: d.campania.gasto,
  })
  const sinResultados: FilaCampania[] = g.sinResultados.map((c) => ({ id: c.id, nombre: c.nombre, valor: null, muestra: null, gasto: c.gasto }))
  const { mejores, peores } = partir(g.ordenadas, UMBRALES.TOP_TABLA)
  const filasPeores = [...sinResultados, ...peores.map(delRanking)]
  const todas = [...g.ordenadas.map(delRanking), ...sinResultados]
  const nombre = TITULO_METRICA[g.metrica]
  return (
    <div>
      {titulo && <h4 className="mt-6 text-xs text-(--color-tenue)">Medidas por {nombre}</h4>}
      {mejores.length > 0 && (
        <>
          <h4 className={lado}>Las que mejor funcionaron</h4>
          <TablaCampanias titulo={`Campañas que mejor funcionaron, por ${nombre}`} filas={mejores.map(delRanking)} metrica={g.metrica} />
        </>
      )}
      {filasPeores.length > 0 && (
        <>
          <h4 className={lado}>Las que peor funcionaron</h4>
          <TablaCampanias titulo={`Campañas que peor funcionaron, por ${nombre}`} filas={filasPeores} metrica={g.metrica} />
        </>
      )}
      {g.pocas && g.sinResultados.length === 0 && (
        <p className="py-1 text-sm text-(--color-tenue)">Pocas campañas con muestra suficiente en el período.</p>
      )}
      {todas.length > 0 && (
        <VerTodas cantidad={todas.length}>
          <TablaCampanias titulo={`Todas las campañas comparables, por ${nombre}`} filas={todas} metrica={g.metrica} />
        </VerTodas>
      )}
    </div>
  )
}

function Campanias({ d }: { d: DestacadosCampanias | null }) {
  return (
    <div>
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

function Publicaciones({ d, conMarca }: { d: DestacadosPublicaciones | null; conMarca: boolean }) {
  const vacio = d === null || d.todas.length === 0
  const filas = (d?.todas ?? []).map((x) => ({ ...aPostFila(x.publicacion), indice: x.indice }))
  const { mejores, peores } = partir(filas, UMBRALES.TOP_TABLA)
  return (
    <div>
      <h3 className={subtitulo}>Publicaciones · contra lo habitual de su cuenta</h3>
      {vacio ? (
        <p className="text-sm text-(--color-tenue)">No hay publicaciones con muestra suficiente para comparar.</p>
      ) : (
        <>
          <h4 className={lado}>Las que mejor funcionaron</h4>
          <TablaPublicaciones titulo="Publicaciones que mejor funcionaron" filas={mejores} conMarca={conMarca} />
          <h4 className={lado}>Las que peor funcionaron</h4>
          <TablaPublicaciones titulo="Publicaciones que peor funcionaron" filas={peores} conMarca={conMarca} />
          <VerTodas cantidad={filas.length}>
            <TablaPublicaciones titulo="Todas las publicaciones comparables" filas={filas} conMarca={conMarca} />
          </VerTodas>
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
      <div className="space-y-10">
        <Publicaciones d={publicaciones} conMarca={conMarca} />
        <Campanias d={campanias} />
      </div>
    </section>
  )
}
