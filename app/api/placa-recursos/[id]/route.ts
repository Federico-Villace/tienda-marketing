import { manejarRecurso } from '@/lib/promocion/recursos-placa'

// En Next 16 `params` es una Promise. Sin extensión en el id: proxy.ts exige sesión (los .png quedan afuera del matcher).
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarRecurso(request, id)
}
