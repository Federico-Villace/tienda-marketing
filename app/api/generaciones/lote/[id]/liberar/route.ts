import { manejarLiberacionLote } from '@/lib/productor/lote/liberar'

// Solo actualiza filas: no llama a Gemini.
export const maxDuration = 30

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarLiberacionLote(request, id, process.env, fetch)
}
