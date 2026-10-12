import { iniciarLogin } from '@/lib/meta/conexion'

export function GET(request: Request) {
  return iniciarLogin(request, process.env, () => crypto.randomUUID())
}
