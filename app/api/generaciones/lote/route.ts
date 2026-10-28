import { manejarEstimacionLote } from '@/lib/productor/lote/estimar'

// Solo lee la tanda y escribe un lote con sus filas: no llama a Gemini.
export const maxDuration = 30

export function POST(request: Request) {
  return manejarEstimacionLote(request, process.env, fetch)
}
