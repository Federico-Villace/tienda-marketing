import { headers } from 'next/headers'
import Link from 'next/link'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { FiltrosContenido } from '@/components/contenido/filtros'
import { Semana } from '@/components/contenido/semana'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { leerRol, puedeEditar } from '@/lib/agentes/pantalla'
import { leerConversaciones } from '@/lib/agentes/conversacion/repositorio'
import { costoAproximadoCambioTexto, formatearCostoCambio } from '@/lib/agentes/conversacion/costos'
import { MODELO_POR_DEFECTO } from '@/lib/agentes/autorizar'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { filtrarGrupos, parsearFiltrosContenido } from '@/lib/contenidista/filtros'
import { leerPiezas, leerTandas } from '@/lib/contenidista/historial'
import { elegirPlanContenido, gruposDeTanda, planesConContenido, tandasDeSemana } from '@/lib/contenidista/pantalla'
import { leerPlanes } from '@/lib/estratega/historial'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

const MAX_PLANES = 30

export default async function Contenido({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; tanda?: string; marca?: string | string[]; comparar?: string | string[]; plataforma?: string | string[]; estado?: string | string[] }>
}) {
  const consulta = await searchParams
  const filtros = parsearFiltrosContenido(consulta)
  // Lo pone proxy.ts tras verificar la sesión. Solo decide qué botones se ven: el endpoint manda.
  const usuarioId = (await headers()).get(HEADER_USUARIO)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()

  type Datos =
    | {
        tipo: 'ok'
        planes: Awaited<ReturnType<typeof leerPlanes>>
        tandas: Awaited<ReturnType<typeof leerTandas>>
        piezas: Awaited<ReturnType<typeof leerPiezas>>
        conversaciones: Awaited<ReturnType<typeof leerConversaciones>>
        rol: string | null
      }
    | { tipo: 'error'; mensaje: string }

  let datos: Datos
  if (!url || !secretKey) {
    datos = { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  } else {
    const s = { url, secretKey }
    try {
      const [todos, rol] = await Promise.all([leerPlanes(s, ORGANIZACION_PILOTO_ID, MAX_PLANES, fetch), leerRol(s, usuarioId, fetch)])
      const tandas = await leerTandas(s, todos.map((p) => p.id), fetch)
      const piezas = await leerPiezas(s, tandas.map((t) => t.id), fetch)
      // Qué versiones nacieron de un cambio pedido a la IA (si falla, simplemente no se marcan).
      const conversaciones = await leerConversaciones(s, 'pieza', [...new Set(piezas.map((p) => p.raizId))], fetch).catch(() => new Map())
      datos = { tipo: 'ok', planes: todos, tandas, piezas, conversaciones, rol }
    } catch (e) {
      datos = { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
    }
  }

  const puede = datos.tipo === 'ok' && puedeEditar(datos.rol)
  const lista = datos.tipo === 'ok' ? planesConContenido(datos.planes, datos.tandas) : []
  const elegido = elegirPlanContenido(lista, consulta.plan)
  const tandasDelPlan = datos.tipo === 'ok' && elegido ? datos.tandas.filter((t) => t.planId === elegido.id) : []
  const habilitado = Boolean(process.env.OPENAI_API_KEY?.trim())
  const costoCambio = formatearCostoCambio(costoAproximadoCambioTexto(process.env.MODELO_CONTENIDISTA?.trim() || MODELO_POR_DEFECTO))

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/contenido" />
      <Encabezado
        fase="Fase 2"
        agente="Contenidista"
        titulo="Calendario de contenido"
        bajada="Toma un plan aprobado y escribe, semana por semana, el hook, el copy, los hashtags, el guion y el brief visual de cada pieza. Solo texto: cuesta centavos. Vos aprobás, corregís o descartás cada una."
      />
      <p role="note" className="mb-6 rounded-lg border border-(--color-borde) px-4 py-3 text-sm text-(--color-tenue)">
        No se publica nada; las imágenes y videos son fase 3.
      </p>

      {datos.tipo === 'ok' && !puede && (
        <div className="mb-6">
          <AvisoSoloVer />
        </div>
      )}

      {datos.tipo === 'error' ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudo cargar el contenido: {datos.mensaje}
        </p>
      ) : !elegido ? (
        <p className="text-sm text-(--color-tenue)">
          Todavía no hay planes aprobados. Aprobá uno en{' '}
          <Link href="/campanas" className="underline">
            Campañas
          </Link>{' '}
          para poder escribir su contenido.
        </p>
      ) : (
        <div className="space-y-8">
          <nav aria-label="Planes" className="flex flex-wrap gap-2 text-sm">
            {lista.map((p) => (
              <Link
                key={p.id}
                href={`/contenido?plan=${p.id}`}
                aria-current={p.id === elegido.id ? 'true' : undefined}
                className={`rounded-md border border-(--color-borde) px-3 py-1 ${p.id === elegido.id ? 'font-semibold' : 'text-(--color-tenue) hover:opacity-70'}`}
              >
                {p.plan.objetivo} · v{p.version}
                {p.estado !== 'aprobado' && <span className="ml-2 text-xs">(reemplazado)</span>}
              </Link>
            ))}
          </nav>

          <FiltrosContenido filtros={filtros} planId={elegido.id} />

          {elegido.plan.calendario.map((fila) => {
            const delaSemana = tandasDeSemana(tandasDelPlan, fila.semana)
            const tanda = delaSemana.find((t) => t.id === consulta.tanda) ?? delaSemana[0] ?? null
            const delaTanda = tanda && datos.tipo === 'ok' ? gruposDeTanda(datos.piezas, tanda.id) : []
            const visibles = filtrarGrupos(delaTanda, filtros)
            return (
              <Semana
                key={fila.semana}
                plan={elegido}
                semana={fila.semana}
                tanda={tanda}
                grupos={visibles}
                ocultas={delaTanda.length - visibles.length}
                tandasPrevias={delaSemana.filter((t) => t.id !== tanda?.id)}
                puedeEditar={puede}
                habilitado={habilitado}
                {...(datos.tipo === 'ok' ? { conversaciones: datos.conversaciones } : {})}
                costoCambio={costoCambio}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
