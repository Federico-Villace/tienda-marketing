import { manejarSubidaFoto } from '@/lib/productor/subir-foto'

// Valida y sube un JPEG de hasta 4 MB: no llama a Gemini.
export const maxDuration = 30

export function POST(request: Request) {
  return manejarSubidaFoto(request, process.env, fetch)
}
