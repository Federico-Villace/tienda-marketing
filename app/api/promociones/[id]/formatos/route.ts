import { manejarFormatos } from '@/lib/promocion/formatos'

// Componer el PNG y subirlo tarda unos segundos (satori + resvg), igual que la placa principal.
export const maxDuration = 60

// En Next 16 `params` es una Promise (ver app/api/promociones/[id]/placa/route.ts).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarFormatos(request, id, process.env, fetch)
}
