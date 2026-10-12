import { procesarCallback } from '@/lib/meta/conexion'

export function GET(request: Request) {
  return procesarCallback(request, process.env, fetch)
}
