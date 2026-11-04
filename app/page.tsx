import { Navegacion } from '@/components/navegacion'
import { PortadaHome } from '@/components/home/portada'
import { cargarPortada } from '@/lib/home/portada'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const datos = await cargarPortada(process.env, fetch).catch(() => ({ placa: null, resultados: null, pendientes: 0 }))
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/" />
      <PortadaHome datos={datos} />
    </main>
  )
}
