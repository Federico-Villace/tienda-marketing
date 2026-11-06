'use client'

import { useEffect } from 'react'
import { alEnfocarVisible } from '@/lib/ui/enfocar'

/** Un solo oyente para toda la app: al tocar un campo de texto en el celu, se lo trae al medio para que el teclado no lo tape. */
export function EnfocarCampos() {
  useEffect(() => {
    const alEnfocar = (e: FocusEvent) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      const esTexto = el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !['radio', 'checkbox', 'file', 'button', 'submit'].includes(el.type))
      if (esTexto) alEnfocarVisible({ currentTarget: el })
    }
    document.addEventListener('focusin', alEnfocar)
    return () => document.removeEventListener('focusin', alEnfocar)
  }, [])
  return null
}
