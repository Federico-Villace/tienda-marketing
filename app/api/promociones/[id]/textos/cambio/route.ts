import { manejarCambioTexto } from '@/lib/promocion/textos/cambio'

// OpenAI puede tardar hasta 90 s (timeout del cliente); queda margen para la base.
export const maxDuration = 120

// En Next 16 `params` es una Promise.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarCambioTexto(request, id, process.env, fetch)
}
