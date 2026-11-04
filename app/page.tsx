import { Navegacion } from '@/components/navegacion'
import { PortadaHome } from '@/components/home/portada'
import { cargarPortada } from '@/lib/home/portada'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const datos = await cargarPortada(process.env, fetch).catch(() => ({ placa: null, resultados: null, pendientes: 0 }))
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/" />
      <header className="mb-10">
        <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">999 Motos</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Promociones listas para publicar y lo que te dicen tus números.</h1>
      </header>
      <PortadaHome datos={datos} />
    </main>
  )
}
