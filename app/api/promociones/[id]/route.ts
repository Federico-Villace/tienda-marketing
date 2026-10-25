import { manejarCambio } from '@/lib/promocion/cambios'

// Aprobar compone la placa si no está al día (satori + resvg) y la sube a Storage.
export const maxDuration = 60

// En Next 16 `params` es una Promise. Se tipa a mano (en vez de RouteContext, que
// solo existe tras `next typegen`) para que `tsc --noEmit` no dependa de .next/.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarCambio(request, id, process.env, fetch)
}
