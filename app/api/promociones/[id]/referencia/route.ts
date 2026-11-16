import { manejarLectura } from '@/lib/promocion/referencia/endpoint'

// Gemini tiene 90 s de timeout; queda margen para la compuerta y para guardar.
export const maxDuration = 120

// En Next 16 `params` es una Promise (ver app/api/promociones/[id]/placa/route.ts).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarLectura(request, id, process.env, fetch)
}
