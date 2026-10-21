import { manejarTanda } from '@/lib/contenidista/endpoint'

// OpenAI puede tardar hasta 90 s (timeout del cliente); queda margen para la base.
export const maxDuration = 120

export function POST(request: Request) {
  return manejarTanda(request, process.env, fetch)
}
