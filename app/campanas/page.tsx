import { headers } from 'next/headers'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { Acciones } from '@/components/campanas/acciones'
import { FormularioBrief } from '@/components/campanas/brief'
import { NotaMeta, PlanCampania } from '@/components/campanas/plan'
import { Versiones } from '@/components/campanas/versiones'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { leerHistorial } from '@/lib/analista/historial'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { agruparPorRaiz, leerPlanes } from '@/lib/estratega/historial'
import { marcasDeUrl } from '@/lib/datos/filtros'
import { marcaPorId } from '@/lib/datos/marcas'
import { elegirPlan, leerRol, marcaIdsDeAnalisis, puedeEditarPlanes, rotuloAnalisis, ventanaPorDefecto } from '@/lib/estratega/pantalla'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

const MAX_ANALISIS = 5
const MAX_PLANES = 30

export default async function Campanas({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; v?: string; analisis?: string; marca?: string | string[] }>
}) {
  const ahora = new Date()
  const consulta = await searchParams
  // Lo pone proxy.ts tras verificar la sesión. Solo decide qué botones se ven: el endpoint manda.
  const usuarioId = (await headers()).get(HEADER_USUARIO)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()

  let datos:
    | { tipo: 'ok'; analisis: Awaited<ReturnType<typeof leerHistorial>>; planes: Awaited<ReturnType<typeof leerPlanes>>; rol: string | null }
    | { tipo: 'error'; mensaje: string }
  if (!url || !secretKey) {
    datos = { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  } else {
    const s = { url, secretKey }
    try {
      const [analisis, planes, rol] = await Promise.all([
        leerHistorial(s, ORGANIZACION_PILOTO_ID, MAX_ANALISIS, fetch),
        leerPlanes(s, ORGANIZACION_PILOTO_ID, MAX_PLANES, fetch),
        leerRol(s, usuarioId, fetch),
      ])
      datos = { tipo: 'ok', analisis, planes, rol }
    } catch (e) {
      datos = { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
    }
  }

  const puedeEditar = datos.tipo === 'ok' && puedeEditarPlanes(datos.rol)
  const grupos = datos.tipo === 'ok' ? agruparPorRaiz(datos.planes) : []
  const elegido = elegirPlan(grupos, consulta)
  const ventana = ventanaPorDefecto(ahora)

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/campanas" />
      <Encabezado
        fase="Fase 2"
        agente="Estratega"
        titulo="Plan de campaña"
        bajada="Lee lo que escribió el Analista —no los datos crudos— y arma objetivo, mensaje central, reparto por canal y calendario. Solo texto: cuesta centavos. Vos aprobás o corregís."
      />
      <NotaMeta />
      {datos.tipo === 'ok' && !puedeEditar && (
        <div className="mb-6">
          <AvisoSoloVer />
        </div>
      )}

      {datos.tipo === 'error' ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudieron cargar los planes: {datos.mensaje}
        </p>
      ) : (
        <div className="space-y-8">
          {puedeEditar && (
            <FormularioBrief
              analisis={datos.analisis.map((a) => ({
                id: a.id,
                rotulo: rotuloAnalisis(a),
                marcas: marcaIdsDeAnalisis(a).map((id) => marcaPorId(id)!.nombre),
              }))}
              analisisInicial={consulta.analisis}
              marcasIniciales={marcasDeUrl(consulta.marca).map((id) => marcaPorId(id)!.nombre)}
              habilitado={Boolean(process.env.OPENAI_API_KEY?.trim())}
              desdePorDefecto={ventana.desde}
              hastaPorDefecto={ventana.hasta}
            />
          )}

          {elegido ? (
            <>
              <PlanCampania vista={elegido.vista} />
              <Acciones vista={elegido.vista} puedeEditar={puedeEditar} esPunta={elegido.esPunta} />
              <Versiones grupos={grupos} raizActual={elegido.grupo.raizId} versionActual={elegido.vista.version} />
            </>
          ) : (
            <p className="text-sm text-(--color-tenue)">
              Todavía no hay planes.{puedeEditar ? ' Armá un brief arriba y generá el primero.' : ''}
            </p>
          )}
        </div>
      )}
    </main>
  )
}
