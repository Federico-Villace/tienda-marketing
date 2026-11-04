/** Subrayado de 2px para la sección activa; los demás items ocupan el mismo alto sin línea. */
export function claseItem(activo: boolean) {
  return `border-b-2 py-1 text-sm ${activo ? 'border-(--color-ok) font-semibold' : 'border-transparent text-(--color-tenue)'}`
}
