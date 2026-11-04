'use client'

import Link from 'next/link'
import { claseItem } from './clase-item'
import { useEffect, useRef, useState } from 'react'

export type ItemMenu = { readonly href: string; readonly nombre: string; readonly descripcion?: string }

/** Menú "Más ▾": botón con aria-expanded; se cierra con click afuera y con Escape. */
export function MenuMas({ items, activa }: { items: readonly ItemMenu[]; activa: string }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const dentro = items.some((i) => i.href === activa)

  useEffect(() => {
    if (!abierto) return
    const afuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-current={dentro ? 'true' : undefined}
        onClick={() => setAbierto((v) => !v)}
        className={`${claseItem(dentro)} inline-flex items-center gap-1 hover:opacity-70`}
      >
        Más
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`size-3 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {abierto && (
        <div className="absolute right-0 z-10 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-y-1 rounded-md border border-(--color-borde) bg-(--color-papel) p-1.5 sm:right-auto sm:left-0">
          {items.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={s.href === activa ? 'page' : undefined}
              onClick={() => setAbierto(false)}
              className={`rounded-md px-2.5 py-1.5 text-sm hover:opacity-70 ${s.href === activa ? 'font-semibold' : 'text-(--color-tenue)'}`}
            >
              {s.nombre}
              {s.descripcion && <span className="block text-xs font-normal text-(--color-tenue)">{s.descripcion}</span>}
            </Link>
          ))}
          <form method="post" action="/api/auth/logout" className="border-t border-(--color-borde) pt-1 sm:hidden">
            <button type="submit" className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-(--color-tenue) hover:opacity-70">
              Salir
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
