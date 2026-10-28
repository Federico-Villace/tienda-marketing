'use client'

import { useId, useState, type ReactNode } from 'react'

/**
 * Una tanda es una sola fila; las hijas (una por marca) aparecen como subfilas al tocar el botón.
 * La cabecera y las subfilas las arma el servidor (lista.tsx): acá solo se abre y se cierra.
 */
export function TandaExpandible({ cabecera, cantidad, rotuloCantidad, children }: { cabecera: ReactNode; cantidad: number; rotuloCantidad?: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  // Una tanda de marcas se abre por marcas; un lote de motos por placas y uno de textos por textos (ADR-032).
  const marcas = rotuloCantidad ?? (cantidad === 1 ? 'la marca' : `las ${cantidad} marcas`)
  return (
    <li data-fila="tanda" className="border-b border-(--color-borde) last:border-b-0">
      {cabecera}
      <div className="px-3 pb-2 sm:pl-18">
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={id}
          onClick={() => setAbierta((a) => !a)}
          className="text-sm text-(--color-tenue) underline underline-offset-2 hover:opacity-70"
        >
          {abierta ? 'Ocultar' : 'Ver'} {marcas}
        </button>
      </div>
      <ul id={id} hidden={!abierta} className="mb-2 ml-3 space-y-1 border-l border-dashed border-(--color-borde) pl-3 sm:ml-18">
        {children}
      </ul>
    </li>
  )
}
