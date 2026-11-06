import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { anton, FUENTES_NAVEGADOR, inter } from '@/components/promocion/fuentes'
import { Tanda } from '@/components/promocion/tanda'
import { FiltrosComunes } from '@/components/ui/filtros-comunes'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { limitesPeriodo, parsearPeriodo } from '@/lib/datos/filtros'
import { leerContextoPagina } from '@/lib/promocion/pagina'
import { leerInspiraciones, type InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import { leerTanda } from '@/lib/promocion/tanda/pantalla'
import { ErrorDeCarga } from '@/components/error-de-carga'

export const dynamic = 'force-dynamic'

export default async function PantallaTanda({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ marca?: string | string[]; comparar?: string | string[]; modelo?: string | string[]; desde?: string | string[]; hasta?: string | string[] }>
}) {
  const { id } = await params
  const consulta = await searchParams
  const usuarioId = (await headers()).get(HEADER_USUARIO)
  const ctx = await leerContextoPagina(process.env, usuarioId, fetch)

  if (ctx.tipo === 'error') {
    return (
      <main className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <Navegacion activa="/promocionar" />
        <ErrorDeCarga />
      </main>
    )
  }

  let tanda: Awaited<ReturnType<typeof leerTanda>>
  let inspiraciones: InspiracionElegible[] = []
  try {
    tanda = await leerTanda(ctx.supabase, id, fetch)
    if (tanda) inspiraciones = await leerInspiraciones(ctx.supabase, fetch).catch(() => [])
  } catch (e) {
    console.error('[promocionar] no se pudo cargar:', e)
    return (
      <main className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <Navegacion activa="/promocionar" />
        <ErrorDeCarga />
      </main>
    )
  }
  if (!tanda) notFound()

  const vivas = tanda.hijas.filter((h) => h.promocion.estado !== 'descartada')
  const modeloDeLaTanda = vivas[0]?.promocion.modelo ?? tanda.hijas[0]?.promocion.modelo ?? ''

  // Sin tabla de comparación (Julián: "molesta más de lo que ayuda"). La comparación entre marcas
  // le sigue llegando al análisis de cada hija desde el servidor; acá solo se elige el período.
  const ahora = new Date()
  const periodo = parsearPeriodo(consulta, ahora)

  return (
    <main className={`${anton.variable} ${inter.variable} mx-auto max-w-7xl px-5 py-10 pb-24 sm:py-14 sm:pb-24 lg:pb-14`}>
      <Navegacion activa="/promocionar" />
      <Encabezado titulo={`Tanda · ${modeloDeLaTanda}`} bajada="Una promoción cargada una vez, una pieza por marca. Lo que cuesta se hace con un click que te muestra el total." />
      {!ctx.puedeEditar && (
        <div className="mb-6">
          <AvisoSoloVer />
        </div>
      )}
      <div className="space-y-10">
        <section aria-label="Período del análisis">
          <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Período que mira el análisis</h2>
          <FiltrosComunes accion={`/promocionar/tanda/${tanda.tanda.id}`} periodo={{ ...periodo, ...limitesPeriodo(ahora) }} />
        </section>
        <Tanda
          tanda={tanda}
          puedeEditar={ctx.puedeEditar}
          habilitado={ctx.openai}
          costoAntecedentesUsd={ctx.costoAntecedentesUsd}
          costoTextosUsd={ctx.costoTextosUsd}
          apagado={ctx.imagen.apagado}
          topeUsd={ctx.imagen.topeUsd}
          motor={ctx.imagen.motor}
          periodo={periodo}
          inspiraciones={inspiraciones}
          fuentes={FUENTES_NAVEGADOR}
        />
      </div>
    </main>
  )
}
