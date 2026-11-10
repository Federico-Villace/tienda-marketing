import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { FAMILIAS_DISENO_NAVEGADOR, FUENTES_NAVEGADOR, VARIABLES_FUENTES } from '@/components/promocion/fuentes'
import { ProveedorDiseno } from '@/components/promocion/contexto-diseno'
import { leerManifiesto } from '@/lib/promocion/logos-servidor'
import { PasoAntecedentes } from '@/components/promocion/paso-antecedentes'
import { PasoAprobar } from '@/components/promocion/paso-aprobar'
import { PasoDatos } from '@/components/promocion/paso-datos'
import { PasoFinal } from '@/components/promocion/paso-final'
import { leerConversacion } from '@/lib/agentes/conversacion/repositorio'
import { opcionesDeImagen } from '@/lib/imagenes/opciones'
import { PasoPlaca } from '@/components/promocion/paso-placa'
import { ResumenPromocion } from '@/components/promocion/resumen-promocion'
import { EditorConVistaPrevia } from '@/components/ui/editor-con-vista-previa'
import { PasoTextos } from '@/components/promocion/paso-textos'
import { Stepper } from '@/components/promocion/stepper'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { limitesPeriodo, parsearPeriodo } from '@/lib/datos/filtros'
import { pasosAlcanzados } from '@/lib/promocion/paso'
import { leerContextoPagina } from '@/lib/promocion/pagina'
import { leerInspiraciones, type InspiracionElegible } from '@/lib/imagenes/inspiraciones'
import { leerDetallePromocion, leerFotosParaPromocion, type DetallePromocion } from '@/lib/promocion/pantalla'
import { ErrorDeCarga } from '@/components/error-de-carga'

export const dynamic = 'force-dynamic'

export default async function Promocion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string; desde?: string | string[]; hasta?: string | string[] }> }) {
  const { id } = await params
  const consulta = await searchParams
  const { paso } = consulta
  const ahora = new Date()
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

  let detalle: DetallePromocion | null
  let fotos: Awaited<ReturnType<typeof leerFotosParaPromocion>> = []
  let inspiraciones: InspiracionElegible[] = []
  try {
    detalle = await leerDetallePromocion(ctx.supabase, id, fetch)
    if (detalle) fotos = await leerFotosParaPromocion(ctx.supabase, fetch)
    if (detalle) inspiraciones = await leerInspiraciones(ctx.supabase, fetch).catch(() => [])
  } catch (e) {
    console.error('[promocionar] no se pudo cargar:', e)
    return (
      <main className="mx-auto max-w-7xl px-5 py-10 sm:py-14">
        <Navegacion activa="/promocionar" />
        <ErrorDeCarga />
      </main>
    )
  }
  if (!detalle) notFound()

  const { promocion } = detalle
  const alcanzados = pasosAlcanzados(promocion)
  // Solo se mira un paso alcanzado: si piden otro (o ninguno), el que le toca a la promoción.
  const pedido = Number(paso)
  const visible = Number.isInteger(pedido) && alcanzados.includes(pedido) ? pedido : promocion.pasoActual
  // Los cambios que se pidieron a la IA sobre el texto (solo se leen en el paso donde se usan).
  const conversacion = visible === 3 ? await leerConversacion(ctx.supabase, 'promocion', id, fetch).catch(() => []) : []

  // La moto, el precio y cómo viene quedando la placa: la columna fija de los pasos que no son el 4.
  const escenaUrl = detalle.escenas.flatMap((e) => e.creativos).find((c) => c.id === promocion.escenaCreativoId)?.url ?? null
  const resumen = <ResumenPromocion promocion={promocion} marca={detalle.marca.nombre} escenaUrl={escenaUrl} placaUrl={detalle.placa?.url ?? null} fuentes={FUENTES_NAVEGADOR} />
  const conResumen = (paso: ReactNode) => <EditorConVistaPrevia controles={paso} previa={resumen} />

  return (
    <ProveedorDiseno manifiesto={leerManifiesto()} familias={FAMILIAS_DISENO_NAVEGADOR}>
    <main className={`${VARIABLES_FUENTES} mx-auto max-w-7xl px-5 py-10 pb-24 sm:py-14 sm:pb-24 lg:pb-14`}>
      <Navegacion activa="/promocionar" />
      <Encabezado titulo={`${detalle.marca.nombre} · ${promocion.modelo}`} bajada="Seis pasos, de la moto a la imagen lista para bajar." />
      {detalle.tanda && (
        <p className="mb-4 rounded-md border border-(--color-borde) px-3 py-2 text-sm">
          Parte de una tanda de {detalle.tanda.total} ·{' '}
          <Link href={`/promocionar/tanda/${detalle.tanda.id}`} className="underline underline-offset-2">
            Volver a la tanda
          </Link>
        </p>
      )}
      {detalle.tanda && (visible === 3 || visible === 4) && (promocion.plantilla !== null || promocion.escenaCreativoId !== null) && (
        <p className="mb-4 rounded-md border border-(--color-borde) px-3 py-2 text-sm text-(--color-tenue)">
          Esto viene de la tanda: el diseño, el fondo y la imagen que elegiste ahí ya están acá. Si querés, podés ajustarlos solo para esta pieza.
        </p>
      )}
      {!ctx.puedeEditar && (
        <div className="mb-4">
          <AvisoSoloVer />
        </div>
      )}
      <Stepper visible={visible} pasoActual={promocion.pasoActual} alcanzados={alcanzados} hrefs={[1, 2, 3, 4, 5, 6].map((n) => `/promocionar/${promocion.id}?paso=${n}`)} />

      {visible === 1 && conResumen(<PasoDatos fotos={detalle.foto && !fotos.some((f) => f.id === detalle.foto!.id) && !detalle.foto.borrada ? [{ id: detalle.foto.id, ancho: detalle.foto.ancho, alto: detalle.foto.alto, creadoEn: promocion.creadoEn, url: detalle.foto.url }, ...fotos] : fotos} puedeEditar={ctx.puedeEditar} promocion={promocion} />)}
      {visible === 2 && conResumen(
        <PasoAntecedentes promocion={promocion} analisis={detalle.analisis} marca={detalle.marca.nombre} habilitado={ctx.openai} puedeEditar={ctx.puedeEditar} costo={ctx.costoAntecedentes} periodo={{ ...parsearPeriodo(consulta, ahora), ...limitesPeriodo(ahora) }} />
      )}
      {visible === 3 && conResumen(
        <PasoTextos
          promocion={promocion}
          textos={detalle.textos ? { id: detalle.textos.id, opciones: detalle.textos.opciones, intento: detalle.textos.intento, desactualizado: detalle.textos.desactualizado } : null}
          habilitado={ctx.openai}
          puedeEditar={ctx.puedeEditar}
          costo={ctx.costoTextos}
          costoCambio={ctx.costoCambio}
          conversacion={conversacion}
        />
      )}
      {visible === 4 && (
        <PasoPlaca
          promocion={promocion}
          marca={detalle.marca.nombre}
          fotoUrl={detalle.foto?.url ?? null}
          escenas={detalle.escenas}
          placaUrl={detalle.placa?.url ?? null}
          puedeEditar={ctx.puedeEditar}
          apagado={ctx.imagen.apagado}
          topeUsd={ctx.imagen.topeUsd}
          gastadoUsd={detalle.gastadoUsd}
          motor={ctx.imagen.motor}
          opciones={opcionesDeImagen('promocion', ctx.imagen.motor)}
          hermanas={detalle.tanda?.hermanas ?? []}
          fuentes={FUENTES_NAVEGADOR}
          inspiracion={detalle.inspiracion}
          inspiraciones={inspiraciones}
        />
      )}
      {visible === 5 && conResumen(<PasoAprobar promocion={promocion} marca={{ nombre: detalle.marca.nombre, usuarioIg: detalle.marca.usuarioIg }} placaUrl={detalle.placa?.url ?? null} puedeEditar={ctx.puedeEditar} />)}
      {visible === 6 && conResumen(<PasoFinal promocion={promocion} placa={detalle.placa} puedeEditar={ctx.puedeEditar} />)}
    </main>
    </ProveedorDiseno>
  )
}
