'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Estilos compartidos de los pasos (los mismos que usa /creativos). */
export const campo = 'mt-1 block w-full rounded-md border border-(--color-borde) bg-transparent px-2 py-1.5 text-sm disabled:opacity-60'
export const boton =
  'rounded-md border border-(--color-borde) px-3 py-1.5 text-sm hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50'
export const botonPrincipal =
  'rounded-md border border-(--color-ok) px-4 py-2 text-sm font-semibold hover:opacity-70 disabled:cursor-not-allowed disabled:border-(--color-borde) disabled:opacity-50'
export const tarjetaOpcion =
  'flex cursor-pointer items-start gap-3 rounded-lg border border-(--color-borde) px-3 py-2.5 text-sm has-[:checked]:border-(--color-ok) has-[:focus-visible]:outline-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'

/**
 * El título del paso: una pregunta y una leyenda de una línea. Al llegar al paso el foco
 * va al título, así quien usa lector de pantalla o teclado sabe dónde está.
 */
export function TituloPaso({ numero, pregunta, leyenda }: { numero: number; pregunta: string; leyenda: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [numero])
  return (
    <header className="mb-4">
      <h2 ref={ref} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none focus-visible:underline">
        {pregunta}
      </h2>
      <p className="mt-1 text-sm text-(--color-tenue)">{leyenda}</p>
    </header>
  )
}

/** Un error o aviso para quien lo necesita ya: role="alert" interrumpe, role="status" espera. */
export function Alerta({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
      {children}
    </p>
  )
}

export function Estado({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-(--color-aviso) px-3 py-2 text-sm text-(--color-aviso)">
      {children}
    </p>
  )
}
