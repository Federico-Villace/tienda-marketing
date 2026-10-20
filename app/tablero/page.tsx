import Link from 'next/link'
import { Navegacion } from '@/components/navegacion'
import {
  agruparPorDiaSemana,
  agruparPorTipo,
  ranking,
  resumir,
} from '@/lib/datos/agregados'
import { MARCAS } from '@/lib/datos/marcas'
import { leerPublicaciones, type PublicacionesReales } from '@/lib/datos/publicaciones'
import { leerPublicidad } from '@/lib/datos/publicidad'
import { rangoDias } from '@/lib/ingesta/transformar'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'
import {
  ListaPublicaciones,
  Resumen,
  TablaAgrupada,
} from '@/components/tablero/piezas'
import { EstadoPublicaciones } from '@/components/tablero/estado-publicaciones'
import { PublicidadReal, type EstadoPublicidad } from '@/components/tablero/publicidad'

/** Publicidad real desde Postgres. Si la base no responde, el tablero sigue en pie. */
async function cargarPublicidad(): Promise<EstadoPublicidad> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) {
    return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  }
  try {
    const { desde } = rangoDias(new Date(), 90)
    return {
      tipo: 'ok',
      datos: await leerPublicidad({ url, secretKey }, ORGANIZACION_PILOTO_ID, desde, fetch),
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

type EstadoPublicacionesCarga =
  | { readonly tipo: 'ok'; readonly datos: PublicacionesReales }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Publicaciones reales desde Postgres. Si la base no responde, el tablero sigue en pie. */
async function cargarPublicaciones(): Promise<EstadoPublicacionesCarga> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) {
    return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  }
  try {
    const { desde } = rangoDias(new Date(), 90)
    return {
      tipo: 'ok',
      datos: await leerPublicaciones({ url, secretKey }, ORGANIZACION_PILOTO_ID, desde, fetch),
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

export const dynamic = 'force-dynamic'

export default async function Tablero({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string }>
}) {
  const { marca: marcaPedida } = await searchParams
  const marca = MARCAS.find((m) => m.id === marcaPedida) ?? MARCAS[0]!

  const [carga, publicidad] = await Promise.all([cargarPublicaciones(), cargarPublicidad()])
  const publicaciones =
    carga.tipo === 'ok' ? carga.datos.publicaciones.filter((p) => p.marcaId === marca.id) : []

  const resumen = resumir(publicaciones)
  const { mejores, peores } = ranking(publicaciones, 5)

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/tablero" />

      <header className="mb-8">
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          Fase 1 · Agente Analista · últimos 90 días
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {marca.nombre}
        </h1>
        <p className="mt-1 text-sm text-(--color-tenue)">@{marca.usuarioIg}</p>
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
        {carga.tipo === 'error' ? (
          <EstadoPublicaciones tipo="error" mensaje={carga.mensaje} />
        ) : publicaciones.length === 0 ? (
          <EstadoPublicaciones tipo="vacio" />
        ) : (
          <>
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
          </>
        )}

        <PublicidadReal estado={publicidad} />

        <section className="border-t border-(--color-borde) pt-8">
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
            Agente Analista
          </h2>
          <div className="rounded-lg border border-(--color-borde) px-4 py-4">
            <p className="text-sm text-(--color-tenue)">
              El Analista lee estos mismos agregados —no las filas crudas— y
              escribe qué funcionó y qué no. Se habilita cuando esté cargada{' '}
              <code className="font-mono text-xs">OPENAI_API_KEY</code>.
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
