'use client'

import { useState, type ReactNode } from 'react'
import { descargar, type DepsDescarga } from '@/lib/descargas/descargar'
import { depsDelNavegador } from '@/lib/descargas/navegador'

/**
 * El link de siempre para bajar una imagen (<a download>): en escritorio funciona solo, sin JS.
 * En el celu, donde el navegador sabe compartir archivos, el click abre el menú de compartir
 * ("Guardar imagen"); si eso falla se abre la imagen y se explica cómo guardarla.
 */
export function EnlaceDescarga({ href, nombre, className, deps, children }: { href: string; nombre: string; className?: string; deps?: DepsDescarga; children: ReactNode }) {
  const [aviso, setAviso] = useState<string | null>(null)
  return (
    <>
      <a
        href={href}
        download={nombre}
        {...(className ? { className } : {})}
        onClick={(e) => {
          const d = deps ?? depsDelNavegador()
          if (!d.puedeCompartirArchivos()) return
          e.preventDefault()
          void descargar({ url: href, nombre }, d).then((r) => setAviso(r.aviso ?? null))
        }}
      >
        {children}
      </a>
      {aviso && (
        <p role="status" className="text-xs">
          {aviso}
        </p>
      )}
    </>
  )
}
