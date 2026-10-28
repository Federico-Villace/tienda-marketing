import { manejarEjecucion } from '@/lib/productor/lote/ejecutar'

// Una moto por request: hasta 2 imágenes en paralelo, cada una con timeout de 120 s, más subida y firmado.
export const maxDuration = 300

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return manejarEjecucion(request, id, process.env, fetch)
}
