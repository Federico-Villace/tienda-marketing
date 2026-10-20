import { manejarAnalisis } from '@/lib/analista/endpoint'

// OpenAI puede tardar hasta 90 s (timeout del cliente); queda margen para la base.
export const maxDuration = 120

export function POST(request: Request) {
  return manejarAnalisis(request, process.env, fetch, new Date())
}
