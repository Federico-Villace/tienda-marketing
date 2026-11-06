/**
 * En el celu, al tocar un campo el teclado tapa la mitad de la pantalla: pasada la animación del
 * teclado se lo trae al medio. En escritorio no hace nada. Se usa en onFocus de campos de formularios.
 */
export function alEnfocarVisible(e: { currentTarget: Element }, esperaMs = 300): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 1023px)').matches) return
  const el = e.currentTarget
  setTimeout(() => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), esperaMs)
}
