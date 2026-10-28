import { manejarConfirmacionLote } from '@/lib/productor/lote/confirmar'

// Confirma en la base (todas o ninguna): no llama a Gemini.
export const maxDuration = 30

// En Next 16 `params` es una Promise (ver ../../../[id]/confirmar/route.ts).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarConfirmacionLote(request, id, process.env, fetch)
}
