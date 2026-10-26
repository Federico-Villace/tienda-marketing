import { headers } from 'next/headers'
import Link from 'next/link'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { FiltrosLista } from '@/components/promocion/filtros-lista'
import { ListaPromociones } from '@/components/promocion/lista'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { filtrarLista, parsearFiltrosLista } from '@/lib/promocion/filtros-lista'
import { leerContextoPagina } from '@/lib/promocion/pagina'
import { leerListaPromociones } from '@/lib/promocion/pantalla'

export const dynamic = 'force-dynamic'

export default async function Promocionar({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string | string[]; comparar?: string | string[]; modelo?: string | string[] }>
}) {
  const filtros = parsearFiltrosLista(await searchParams)
  // Lo pone proxy.ts tras verificar la sesión. Solo decide qué botones se ven: los endpoints mandan.
  const usuarioId = (await headers()).get(HEADER_USUARIO)
  const ctx = await leerContextoPagina(process.env, usuarioId, fetch)

  let lista: Awaited<ReturnType<typeof leerListaPromociones>> | null = null
  let fallo: string | null = ctx.tipo === 'error' ? ctx.mensaje : null
  if (ctx.tipo === 'ok') {
    try {
      lista = await leerListaPromociones(ctx.supabase, fetch)
    } catch (e) {
      fallo = e instanceof Error ? e.message : String(e)
    }
  }
  const puedeEditar = ctx.tipo === 'ok' && ctx.puedeEditar

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/promocionar" />
      <Encabezado
        fase="Fase 3"
        titulo="Promociones"
        bajada="Elegí la moto, el precio y la promo, y te llevamos paso a paso hasta una imagen y un texto listos para bajar."
      />
      {puedeEditar && (
        <Link href="/promocionar/nueva" className="mb-8 inline-block rounded-md border border-(--color-ok) px-4 py-2 text-sm font-semibold hover:opacity-70">
          Nueva promoción
        </Link>
      )}
      {fallo ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudieron cargar las promociones: {fallo}
        </p>
      ) : (
        lista && (
          <>
            <FiltrosLista filtros={filtros} />
            <ListaPromociones borradores={filtrarLista(lista.borradores, filtros)} aprobadas={filtrarLista(lista.aprobadas, filtros)} soloVer={!puedeEditar} filtrada={lista.borradores.length + lista.aprobadas.length > 0} />
          </>
        )
      )}
    </main>
  )
}
