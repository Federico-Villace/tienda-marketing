import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { ComparacionMarcas } from '@/components/promocion/comparacion'
import { Tanda } from '@/components/promocion/tanda'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { marcasDeUrl } from '@/lib/datos/filtros'
import { filasDeComparacion, leerComparacionPromocion, type FilaComparacion } from '@/lib/datos/promocion'
import { rangoDias } from '@/lib/ingesta/transformar'
import { ORGANIZACION_PILOTO_ID } from '@/lib/organizacion'
import { leerContextoPagina } from '@/lib/promocion/pagina'
import { leerTanda } from '@/lib/promocion/tanda/pantalla'

export const dynamic = 'force-dynamic'

const VENTANA_DIAS = 90

export default async function PantallaTanda({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ comparar?: string | string[]; modelo?: string | string[] }>
}) {
  const { id } = await params
  const consulta = await searchParams
  const usuarioId = (await headers()).get(HEADER_USUARIO)
  const ctx = await leerContextoPagina(process.env, usuarioId, fetch)

  if (ctx.tipo === 'error') {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <Navegacion activa="/promocionar" />
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudo cargar la tanda: {ctx.mensaje}
        </p>
      </main>
    )
  }

  let tanda: Awaited<ReturnType<typeof leerTanda>>
  try {
    tanda = await leerTanda(ctx.supabase, id, fetch)
  } catch (e) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <Navegacion activa="/promocionar" />
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudo cargar la tanda: {e instanceof Error ? e.message : String(e)}
        </p>
      </main>
    )
  }
  if (!tanda) notFound()

  const vivas = tanda.hijas.filter((h) => h.promocion.estado !== 'descartada')
  const modeloDeLaTanda = vivas[0]?.promocion.modelo ?? tanda.hijas[0]?.promocion.modelo ?? ''

  // La comparación es de lectura (gratis): marcas y modelos vienen de la URL; por defecto, las de la tanda.
  const elegidas = marcasDeUrl(consulta.comparar)
  const marcaIds = elegidas.length > 0 ? elegidas : vivas.map((h) => h.marca.id)
  const pedidos = [consulta.modelo ?? []].flat().map((m) => m.trim()).filter(Boolean)
  const modelos = pedidos.length > 0 ? pedidos.slice(0, 3) : [modeloDeLaTanda]
  let filas: FilaComparacion[] = []
  let fallo: string | null = null
  try {
    filas = filasDeComparacion(await leerComparacionPromocion(ctx.supabase, ORGANIZACION_PILOTO_ID, { marcaIds, modelos, ...rangoDias(new Date(), VENTANA_DIAS) }, fetch))
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e)
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/promocionar" />
      <Encabezado fase="Fase 3" titulo={`Tanda · ${modeloDeLaTanda}`} bajada="Una promoción cargada una vez, una pieza por marca. Lo que cuesta se hace con un click que te muestra el total." />
      <div className="space-y-10">
        <ComparacionMarcas accion={`/promocionar/tanda/${tanda.tanda.id}`} marcaIds={marcaIds} modelos={modelos} filas={filas} fallo={fallo} />
        <Tanda
          tanda={tanda}
          puedeEditar={ctx.puedeEditar}
          habilitado={ctx.openai}
          costoAntecedentesUsd={ctx.costoAntecedentesUsd}
          costoTextosUsd={ctx.costoTextosUsd}
          apagado={ctx.imagen.apagado}
          topeUsd={ctx.imagen.topeUsd}
          motor={ctx.imagen.motor}
        />
      </div>
    </main>
  )
}
