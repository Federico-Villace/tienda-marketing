import { manejarPlan } from '@/lib/estratega/endpoint'

// OpenAI puede tardar hasta 90 s (timeout del cliente); queda margen para la base.
export const maxDuration = 120

export function POST(request: Request) {
  return manejarPlan(request, process.env, fetch)
}
