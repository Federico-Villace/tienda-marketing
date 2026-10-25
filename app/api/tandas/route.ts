import { manejarCreacionTanda } from '@/lib/promocion/tanda/crear'

// Crear la tanda no llama a ningún modelo: alcanza con poco tiempo.
export const maxDuration = 30

export function POST(request: Request) {
  return manejarCreacionTanda(request, process.env, fetch)
}
