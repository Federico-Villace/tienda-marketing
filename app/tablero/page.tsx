import { headers } from 'next/headers'
import { Navegacion } from '@/components/navegacion'
import {
  agruparPorDiaSemana,
  agruparPorTipo,
  ranking,
  resumir,
} from '@/lib/datos/agregados'
import { filtrarPublicaciones, parsearFiltros, VENTANA_DIAS, type Filtros } from '@/lib/datos/filtros'
import { MARCAS } from '@/lib/datos/marcas'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { leerRol, puedeEditarPlanes } from '@/lib/estratega/pantalla'
import { leerHistorial, type AnalisisVista } from '@/lib/analista/historial'
import { leerPublicaciones, type PublicacionesReales } from '@/lib/datos/publicaciones'
import { leerMensajes } from '@/lib/datos/mensajes'
import { leerPublicidad } from '@/lib/datos/publicidad'
import { rangoDias } from '@/lib/ingesta/transformar'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'
import {
  ListaPublicaciones,
  Resumen,
  TablaAgrupada,
} from '@/components/tablero/piezas'
import { FiltrosTablero } from '@/components/tablero/filtros'
import { Analista } from '@/components/tablero/analista'
import { EstadoPublicaciones } from '@/components/tablero/estado-publicaciones'
import { ActualizarEstadisticas } from '@/components/tablero/actualizar'
import { MensajesRecibidos, type EstadoMensajes } from '@/components/tablero/mensajes'
import { PublicidadReal, type EstadoPublicidad } from '@/components/tablero/publicidad'

/** Publicidad real desde Postgres. Si la base no responde, el tablero sigue en pie. */
async function cargarPublicidad(f: Filtros): Promise<EstadoPublicidad> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) {
    return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  }
  try {
    return {
      tipo: 'ok',
      datos: await leerPublicidad({ url, secretKey }, ORGANIZACION_PILOTO_ID, f.desde, fetch, f.hasta),
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

type EstadoPublicacionesCarga =
  | { readonly tipo: 'ok'; readonly datos: PublicacionesReales }
  | { readonly tipo: 'error'; readonly mensaje: string }

/** Publicaciones reales desde Postgres. Si la base no responde, el tablero sigue en pie. */
async function cargarPublicaciones(f: Filtros): Promise<EstadoPublicacionesCarga> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) {
    return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  }
  try {
    return {
      tipo: 'ok',
      datos: await leerPublicaciones({ url, secretKey }, ORGANIZACION_PILOTO_ID, f.desde, fetch, f.hasta),
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

/** Mensajes recibidos (solo conteos) desde Postgres. Si la base no responde, el tablero sigue en pie. */
async function cargarMensajes(f: Filtros): Promise<EstadoMensajes> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) {
    return { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  }
  try {
    return {
      tipo: 'ok',
      cuentas: await leerMensajes({ url, secretKey }, ORGANIZACION_PILOTO_ID, f.desde, fetch, f.hasta),
    }
  } catch (e) {
    return { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

/** Los últimos análisis guardados. Si falla, el tablero sigue en pie sin historial. */
async function cargarHistorial(): Promise<AnalisisVista[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return []
  try {
    return await leerHistorial({ url, secretKey }, ORGANIZACION_PILOTO_ID, 5, fetch)
  } catch {
    return []
  }
}

/** Solo decide si se ve el botón de actualizar: el endpoint es la autoridad. Ante la duda, no se ve. */
async function cargarPuedeActualizar(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secretKey) return false
  try {
    const usuarioId = (await headers()).get(HEADER_USUARIO)
    return puedeEditarPlanes(await leerRol({ url, secretKey }, usuarioId, fetch))
  } catch {
    return false
  }
}

export const dynamic = 'force-dynamic'

export default async function Tablero({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string; plataforma?: string; desde?: string; hasta?: string }>
}) {
  const ahora = new Date()
  const filtros = parsearFiltros(await searchParams, ahora)
  const marca = MARCAS.find((m) => m.id === filtros.marcaId) ?? MARCAS[0]!
  const ventana = rangoDias(ahora, VENTANA_DIAS)

  const [carga, mensajes, publicidad, historial, puedeActualizar] = await Promise.all([
    cargarPublicaciones(filtros),
    cargarMensajes(filtros),
    cargarPublicidad(filtros),
    cargarHistorial(),
    cargarPuedeActualizar(),
  ])
  const publicaciones = carga.tipo === 'ok' ? filtrarPublicaciones(carga.datos.publicaciones, filtros) : []

  const resumen = resumir(publicaciones)
  const { mejores, peores } = ranking(publicaciones, 5)

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/tablero" />

      <header className="mb-8">
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          Fase 1 · Agente Analista · {filtros.desde} – {filtros.hasta}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {marca.nombre}
        </h1>
        <p className="mt-1 text-sm text-(--color-tenue)">@{marca.usuarioIg}</p>
        <div className="mt-4">
          <ActualizarEstadisticas puedeActualizar={puedeActualizar} />
        </div>
      </header>

      <FiltrosTablero filtros={filtros} minimo={ventana.desde} maximo={ventana.hasta} />

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

        <MensajesRecibidos estado={mensajes} filtros={filtros} />

        <PublicidadReal estado={publicidad} />

        <Analista
          filtros={filtros}
          habilitado={Boolean(process.env.OPENAI_API_KEY?.trim())}
          historial={historial}
          sinPublicaciones={carga.tipo === 'ok' && publicaciones.length === 0}
          puedeEditar={puedeActualizar}
        />
      </div>
    </main>
  )
}
