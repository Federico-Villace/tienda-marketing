import { manejarPlaca } from '@/lib/promocion/placa'

// Componer el PNG (satori + resvg) y subirlo a Storage tarda unos segundos.
export const maxDuration = 60

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarPlaca(request, id, process.env, fetch)
}
