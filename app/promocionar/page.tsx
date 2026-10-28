import { headers } from 'next/headers'
import Link from 'next/link'
import { Navegacion } from '@/components/navegacion'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { FiltrosLista } from '@/components/promocion/filtros-lista'
import { ListaPromociones } from '@/components/promocion/lista'
import { MARCAS } from '@/lib/datos/marcas'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { parsearFiltrosLista } from '@/lib/promocion/filtros-lista'
import { armarVista, parsearVista } from '@/lib/promocion/lista-vista'
import { leerContextoPagina } from '@/lib/promocion/pagina'
import { leerListaPromociones } from '@/lib/promocion/pantalla'

export const dynamic = 'force-dynamic'

export default async function Promocionar({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string | string[]; comparar?: string | string[]; modelo?: string | string[]; ver?: string | string[]; pagina?: string | string[] }>
}) {
  const params = await searchParams
  const filtros = parsearFiltrosLista(params)
  const { ver, pagina } = parsearVista(params)
  // Lo pone proxy.ts tras verificar la sesión. Solo decide qué botones se ven: los endpoints mandan.
  const usuarioId = (await headers()).get(HEADER_USUARIO)
  const ctx = await leerContextoPagina(process.env, usuarioId, fetch)

  let lista: Awaited<ReturnType<typeof leerListaPromociones>> | null = null
  let vista: ReturnType<typeof armarVista> | null = null
  let fallo: string | null = ctx.tipo === 'error' ? ctx.mensaje : null
  if (ctx.tipo === 'ok') {
    try {
      // Solo a las filas de la página visible se les firma miniatura y descarga.
      lista = await leerListaPromociones(ctx.supabase, fetch, (l) =>
        armarVista(l, filtros, ver, pagina).entradas.flatMap((e) => (e.tipo === 'suelta' ? [e.item] : e.items)),
      )
      vista = armarVista(lista, filtros, ver, pagina)
    } catch (e) {
      fallo = e instanceof Error ? e.message : String(e)
    }
  }
  const puedeEditar = ctx.tipo === 'ok' && ctx.puedeEditar

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/promocionar" />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Promociones</h1>
          <p className="mt-2 max-w-2xl text-(--color-tenue)">Las que te faltan terminar y las que ya aprobaste, en un solo lugar.</p>
        </div>
        {puedeEditar && (
          <Link href="/promocionar/nueva" className="rounded-md border border-(--color-ok) px-4 py-2 text-sm font-semibold hover:opacity-70">
            Nueva promoción
          </Link>
        )}
      </header>
      {ctx.tipo === 'ok' && !puedeEditar && (
        <div className="mb-6">
          <AvisoSoloVer />
        </div>
      )}
      {fallo ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudieron cargar las promociones: {fallo}
        </p>
      ) : (
        lista &&
        vista && (
          <>
            <FiltrosLista filtros={filtros} ver={ver} />
            <ListaPromociones
              vista={vista}
              ver={ver}
              filtros={filtros}
              soloVer={!puedeEditar}
              conFiltros={filtros.modelo !== '' || filtros.marcaIds.length < MARCAS.length}
              truncada={lista.truncada}
            />
          </>
        )
      )}
    </main>
  )
}
