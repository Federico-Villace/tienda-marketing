import { manejarReverificacion } from '@/lib/promocion/copia/reverificar'

// Una llamada de visión de hasta 75 s, más la descarga de la imagen y la compuerta.
export const maxDuration = 120

// En Next 16 `params` es una Promise (ver app/api/promociones/[id]/placa/route.ts).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarReverificacion(request, id, process.env, fetch)
}
