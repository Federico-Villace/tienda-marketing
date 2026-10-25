import { manejarCreacion } from '@/lib/promocion/crear'

// Crear el borrador no llama a ningún modelo: alcanza con poco tiempo.
export const maxDuration = 30

export function POST(request: Request) {
  return manejarCreacion(request, process.env, fetch)
}
