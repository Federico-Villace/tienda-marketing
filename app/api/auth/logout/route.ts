import { procesarLogout } from '@/lib/auth/login'

export function POST(request: Request) {
  return procesarLogout(request, process.env, fetch)
}
