'use client'

import { useRouter } from 'next/navigation'

/**
 * Cuando una pantalla no puede leer sus datos: un mensaje humano y un Reintentar.
 * El detalle técnico (p. ej. "Supabase 401…") no se muestra: la página lo deja en el log del servidor.
 */
export function ErrorDeCarga() {
  const router = useRouter()
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-(--color-falta) px-3 py-2 text-sm">
      <p>No se pudo cargar. Probá de nuevo.</p>
      <button type="button" className="rounded-md border border-(--color-borde) px-3 py-1 font-medium" onClick={() => router.refresh()}>
        Reintentar
      </button>
    </div>
  )
}
