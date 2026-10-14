import { procesarLogin } from '@/lib/auth/login'

export function POST(request: Request) {
  return procesarLogin(request, process.env, fetch)
}
