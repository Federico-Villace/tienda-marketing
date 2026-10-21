import { headers } from 'next/headers'
import Link from 'next/link'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { Semana } from '@/components/contenido/semana'
import { leerRol, puedeEditar } from '@/lib/agentes/pantalla'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { leerPiezas, leerTandas } from '@/lib/contenidista/historial'
import { elegirPlanContenido, gruposDeTanda, planesConContenido, tandasDeSemana } from '@/lib/contenidista/pantalla'
import { leerPlanes } from '@/lib/estratega/historial'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'

export const dynamic = 'force-dynamic'

const MAX_PLANES = 30

export default async function Contenido({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; tanda?: string }>
}) {
  const consulta = await searchParams
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
      datos = { tipo: 'ok', planes: todos, tandas, piezas, rol }
    } catch (e) {
      datos = { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
    }
  }

  const puede = datos.tipo === 'ok' && puedeEditar(datos.rol)
  const lista = datos.tipo === 'ok' ? planesConContenido(datos.planes, datos.tandas) : []
  const elegido = elegirPlanContenido(lista, consulta.plan)
  const tandasDelPlan = datos.tipo === 'ok' && elegido ? datos.tandas.filter((t) => t.planId === elegido.id) : []
  const habilitado = Boolean(process.env.OPENAI_API_KEY?.trim())

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

          {elegido.plan.calendario.map((fila) => {
            const delaSemana = tandasDeSemana(tandasDelPlan, fila.semana)
            const tanda = delaSemana.find((t) => t.id === consulta.tanda) ?? delaSemana[0] ?? null
            return (
              <Semana
                key={fila.semana}
                plan={elegido}
                semana={fila.semana}
                tanda={tanda}
                grupos={tanda && datos.tipo === 'ok' ? gruposDeTanda(datos.piezas, tanda.id) : []}
                tandasPrevias={delaSemana.filter((t) => t.id !== tanda?.id)}
                puedeEditar={puede}
                habilitado={habilitado}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
