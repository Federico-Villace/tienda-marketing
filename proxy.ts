/**
 * Toda la app pide sesión, salvo /login y /api/sync (ADR-015).
 * La lógica vive en lib/auth/acceso.ts; acá solo se traduce a Next.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { controlarAcceso } from '@/lib/auth/acceso'

export async function proxy(request: NextRequest) {
  const r = await controlarAcceso(request, process.env, fetch)
  if (r.tipo === 'responder') return r.respuesta

  const respuesta = NextResponse.next()
  for (const c of r.setCookies ?? []) respuesta.headers.append('set-cookie', c)
  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt)$).*)'],
}
