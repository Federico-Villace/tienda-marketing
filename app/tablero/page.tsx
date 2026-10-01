import Link from 'next/link'
import {
  agruparPorDiaSemana,
  agruparPorTipo,
  ranking,
  resumir,
} from '@/lib/datos/agregados'
import {
  MARCAS,
  campaniasDeMuestra,
  publicacionesDeMuestra,
} from '@/lib/datos/muestra'
import {
  ListaPublicaciones,
  Resumen,
  TablaAgrupada,
  Tarjeta,
  fmt,
} from '@/components/tablero/piezas'

export const dynamic = 'force-dynamic'

export default async function Tablero({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string }>
}) {
  const { marca: marcaPedida } = await searchParams
  const marca = MARCAS.find((m) => m.id === marcaPedida) ?? MARCAS[0]!

  // TODO(ingesta): reemplazar por la consulta a Supabase. Los agregados y los
  // componentes no cambian: solo cambia de dónde salen estas dos listas.
  const publicaciones = publicacionesDeMuestra().filter(
    (p) => p.marcaId === marca.id,
  )
  const campanias = campaniasDeMuestra().filter((c) => c.marcaId === marca.id)

  const resumen = resumir(publicaciones)
  const { mejores, peores } = ranking(publicaciones, 5)

  const gasto = campanias.reduce((t, c) => t + c.gasto, 0)
  const clics = campanias.reduce((t, c) => t + c.clics, 0)
  const conversiones = campanias.reduce((t, c) => t + c.conversiones, 0)

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
              Últimos 90 días
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {marca.nombre}
            </h1>
            <p className="mt-1 text-sm text-(--color-tenue)">
              @{marca.usuarioIg}
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-(--color-tenue) underline underline-offset-4"
          >
            Configuración
          </Link>
        </div>

        <div
          className="mt-5 rounded-lg border border-(--color-aviso) px-4 py-2.5 text-sm text-(--color-aviso)"
          role="status"
        >
          Datos de muestra. Las 7 marcas son reales; las métricas están
          inventadas hasta que entre la ingesta.
        </div>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2">
        {MARCAS.map((m) => (
          <Link
            key={m.id}
            href={`/tablero?marca=${m.id}`}
            className={`rounded-full border px-3 py-1 text-sm transition-opacity ${
              m.id === marca.id
                ? 'border-current font-medium'
                : 'border-(--color-borde) text-(--color-tenue) hover:opacity-70'
            }`}
          >
            {m.nombre}
          </Link>
        ))}
      </nav>

      <div className="space-y-10">
        <Resumen resumen={resumen} />

        <TablaAgrupada
          titulo="Rendimiento por formato"
          rotuloClave="Formato"
          filas={agruparPorTipo(publicaciones)}
        />

        <TablaAgrupada
          titulo="Rendimiento por día de la semana"
          rotuloClave="Día"
          filas={agruparPorDiaSemana(publicaciones)}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <ListaPublicaciones titulo="Las que mejor funcionaron" publicaciones={mejores} />
          <ListaPublicaciones titulo="Las que peor funcionaron" publicaciones={peores} />
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Publicidad
          </h2>
          {campanias.length === 0 ? (
            <p className="rounded-lg border border-(--color-borde) px-4 py-3 text-sm text-(--color-tenue)">
              Sin campañas en el período.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tarjeta rotulo="Campañas" valor={String(campanias.length)} />
              <Tarjeta rotulo="Gasto" valor={fmt.moneda.format(gasto)} />
              <Tarjeta rotulo="Clics" valor={fmt.numero.format(clics)} />
              <Tarjeta
                rotulo="Conversiones"
                valor={fmt.numero.format(conversiones)}
                detalle={
                  conversiones > 0
                    ? `${fmt.moneda.format(gasto / conversiones)} por conversión`
                    : undefined
                }
              />
            </div>
          )}
        </section>

        <section className="border-t border-(--color-borde) pt-8">
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Agente Analista
          </h2>
          <div className="rounded-lg border border-(--color-borde) px-4 py-4">
            <p className="text-sm text-(--color-tenue)">
              El Analista lee estos mismos agregados —no las filas crudas— y
              escribe qué funcionó y qué no. Se habilita cuando esté cargada{' '}
              <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>.
            </p>
            <button
              type="button"
              disabled
              className="mt-3 cursor-not-allowed rounded-md border border-(--color-borde) px-3 py-1.5 text-sm opacity-50"
            >
              Analizar período
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
