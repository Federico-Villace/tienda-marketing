import { FormularioLogin } from '@/components/login'

export const dynamic = 'force-dynamic'

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; volver?: string }>
}) {
  const { error, volver } = await searchParams
  return (
    <main className="mx-auto max-w-sm px-5 py-20">
      <p className="font-mono text-xs tracking-widest text-(--color-tenue) uppercase">999 Motos</p>
      <h1 className="mt-1 mb-8 text-2xl font-semibold tracking-tight">Entrar</h1>
      <FormularioLogin error={error} volver={volver} />
    </main>
  )
}
