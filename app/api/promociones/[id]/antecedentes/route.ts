import { manejarAntecedentes } from '@/lib/promocion/antecedentes/endpoint'

// OpenAI puede tardar hasta 90 s (timeout del cliente); queda margen para la base.
export const maxDuration = 120

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarAntecedentes(request, id, process.env, fetch, new Date())
}
