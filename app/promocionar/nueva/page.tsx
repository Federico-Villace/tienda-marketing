import { headers } from 'next/headers'
import { Encabezado, Navegacion } from '@/components/navegacion'
import { AvisoSoloVer } from '@/components/ui/aviso-solo-ver'
import { PasoDatos } from '@/components/promocion/paso-datos'
import { Stepper } from '@/components/promocion/stepper'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { leerContextoPagina } from '@/lib/promocion/pagina'
import { leerFotosParaPromocion } from '@/lib/promocion/pantalla'

export const dynamic = 'force-dynamic'

export default async function NuevaPromocion() {
  const usuarioId = (await headers()).get(HEADER_USUARIO)
  const ctx = await leerContextoPagina(process.env, usuarioId, fetch)

  let fotos: Awaited<ReturnType<typeof leerFotosParaPromocion>> = []
  let fallo: string | null = ctx.tipo === 'error' ? ctx.mensaje : null
  if (ctx.tipo === 'ok') {
    try {
      fotos = await leerFotosParaPromocion(ctx.supabase, fetch)
    } catch (e) {
      fallo = e instanceof Error ? e.message : String(e)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <Navegacion activa="/promocionar" />
      <Encabezado fase="Fase 3" titulo="Nueva promoción" bajada="Seis pasos, de la moto a la imagen lista para bajar. Podés dejar a medias y seguir después." />
      {ctx.tipo === 'ok' && !ctx.puedeEditar && (
        <div className="mb-4">
          <AvisoSoloVer />
        </div>
      )}
      <Stepper visible={1} alcanzados={[1]} hrefDe={(n) => (n === 1 ? '/promocionar/nueva' : '/promocionar')} />
      {fallo ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudo cargar la pantalla: {fallo}
        </p>
      ) : (
        <PasoDatos fotos={fotos} puedeEditar={ctx.tipo === 'ok' && ctx.puedeEditar} />
      )}
    </main>
  )
}
