import { manejarConfirmacion } from '@/lib/productor/confirmar'

// Hasta 4 imágenes en paralelo, cada una con timeout de 120 s, más subida y firmado.
export const maxDuration = 300

// En Next 16 `params` es una Promise. Se tipa a mano (en vez de RouteContext, que
// solo existe tras `next typegen`) para que `tsc --noEmit` no dependa de .next/.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarConfirmacion(request, id, process.env, fetch)
}
