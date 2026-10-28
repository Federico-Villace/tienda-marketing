import { headers } from 'next/headers'
import { Navegacion } from '@/components/navegacion'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { MODELO_POR_DEFECTO } from '@/lib/agentes/autorizar'
import { costoAproximadoAnalisis, formatearCostoAproximado } from '@/lib/analista/costos'
import { destacarCampanias, destacarPublicaciones, rendimientoPorFormato } from '@/lib/datos/destacados'
import {
  agruparPorDiaSemana,
  agruparPorMarca,
  agruparPorTipo,
  resumir,
} from '@/lib/datos/agregados'
import { filtrarPublicaciones, parsearFiltros, VENTANA_DIAS, type Filtros } from '@/lib/datos/filtros'
import { MARCAS, marcaPorId, rotuloMarcas } from '@/lib/datos/marcas'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { leerRol, puedeEditarPlanes } from '@/lib/estratega/pantalla'
import { aCampaniaFila, aPostFila, type Origen } from '@/lib/analista/origen'
import { leerHistorial, type AnalisisVista } from '@/lib/analista/historial'
import { leerPublicaciones, type PublicacionesReales } from '@/lib/datos/publicaciones'
import { leerMensajes } from '@/lib/datos/mensajes'
import { atribuirCampanias, leerPublicidad } from '@/lib/datos/publicidad'
import { rangoDias } from '@/lib/ingesta/transformar'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'
import { Resumen, TablaAgrupada } from '@/components/tablero/piezas'
import { FiltrosTablero } from '@/components/tablero/filtros'
import { Analista } from '@/components/tablero/analista'
import { EstadoPublicaciones } from '@/components/tablero/estado-publicaciones'
import { Destacados } from '@/components/tablero/destacados'
import { Formatos } from '@/components/tablero/formatos'
import { DatosCompletos } from '@/components/tablero/datos-completos'
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
  searchParams: Promise<Partial<Record<'marca' | 'plataforma' | 'desde' | 'hasta', string | string[]>>>
}) {
  const ahora = new Date()
  const filtros = parsearFiltros(await searchParams, ahora)
  const varias = filtros.marcaIds.length > 1
  const marca = marcaPorId(filtros.marcaIds[0]!) ?? MARCAS[0]!
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
  const destacadosCampanias =
    publicidad.tipo === 'ok'
      ? destacarCampanias(publicidad.datos.campanias, filtros.marcaIds, filtros.marcaIds.length === MARCAS.length)
      : null
  // Detrás de cada dato del Analista: solo se muestra, no va al modelo.
  const origen: Origen = {
    publicaciones: publicaciones.map(aPostFila),
    campanias: publicidad.tipo === 'ok' ? publicidad.datos.campanias.map(aCampaniaFila) : [],
  }
  const destacadosPublicaciones = publicaciones.length > 0 ? destacarPublicaciones(publicaciones, filtros.hasta) : null

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/tablero" />

      <header className="mb-8">
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">
          Fase 1 · Agente Analista · {filtros.desde} – {filtros.hasta}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {varias ? (filtros.marcaIds.length === MARCAS.length ? 'Todas las marcas' : `${filtros.marcaIds.length} marcas`) : marca.nombre}
        </h1>
        <p className="mt-1 text-sm text-(--color-tenue)">{varias ? rotuloMarcas(filtros.marcaIds) : `@${marca.usuarioIg}`}</p>
        <div className="mt-4">
          {puedeActualizar ? <ActualizarEstadisticas puedeActualizar /> : <AvisoSoloVer />}
        </div>
      </header>

      <FiltrosTablero filtros={filtros} minimo={ventana.desde} maximo={ventana.hasta} />

      <div className="space-y-10">
        {carga.tipo === 'error' ? (
          <EstadoPublicaciones tipo="error" mensaje={carga.mensaje} />
        ) : publicaciones.length === 0 ? (
          <EstadoPublicaciones tipo="vacio" />
        ) : (
          <Resumen resumen={resumen} />
        )}

        <Destacados campanias={destacadosCampanias} publicaciones={destacadosPublicaciones} conMarca={varias} />

        <Formatos filas={rendimientoPorFormato(publicaciones)} />

        <Analista
          filtros={filtros}
          habilitado={Boolean(process.env.OPENAI_API_KEY?.trim())}
          historial={historial}
          sinPublicaciones={carga.tipo === 'ok' && publicaciones.length === 0}
          puedeEditar={puedeActualizar}
          origen={origen}
          costo={formatearCostoAproximado(costoAproximadoAnalisis(process.env.MODELO_ANALISTA?.trim() || MODELO_POR_DEFECTO))}
        />

        <DatosCompletos>
          {publicaciones.length > 0 && (
            <>
              {varias && (
                <TablaAgrupada titulo="Rendimiento por marca" rotuloClave="Marca" filas={agruparPorMarca(publicaciones)} />
              )}

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
            </>
          )}

          <MensajesRecibidos estado={mensajes} filtros={filtros} />

          <PublicidadReal
            estado={publicidad}
            atribucion={varias && publicidad.tipo === 'ok' ? atribuirCampanias(publicidad.datos.campanias, filtros.marcaIds) : undefined}
          />
        </DatosCompletos>
      </div>
    </main>
  )
}
