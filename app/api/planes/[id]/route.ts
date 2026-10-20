import { manejarCambioPlan } from '@/lib/estratega/cambios'

// En Next 16 `params` es una Promise. Se tipa a mano (en vez de RouteContext, que
// solo existe tras `next typegen`) para que `tsc --noEmit` no dependa de .next/.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarCambioPlan(request, id, process.env, fetch)
}
