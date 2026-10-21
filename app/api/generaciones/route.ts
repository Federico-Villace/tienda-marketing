import { manejarEstimacion } from '@/lib/productor/estimacion'

// Solo lee una pieza y escribe una fila: no llama a Gemini.
export const maxDuration = 30

export function POST(request: Request) {
  return manejarEstimacion(request, process.env, fetch)
}
