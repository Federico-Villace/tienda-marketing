/** Lo que se ve en lugar de las publicaciones cuando no hay nada que mostrar. */
export function EstadoPublicaciones(
  props: { readonly tipo: 'vacio' } | { readonly tipo: 'error'; readonly mensaje: string },
) {
  if (props.tipo === 'error') {
    return (
      <p role="alert" className="rounded-lg border border-(--color-falta) px-4 py-3 text-sm">
        No se pudieron leer las publicaciones de la base.{' '}
        <span className="font-mono text-xs text-(--color-tenue)">{props.mensaje}</span>
      </p>
    )
  }
  return (
    <p className="rounded-lg border border-(--color-borde) px-4 py-3 text-sm text-(--color-tenue)">
      Todavía no hay publicaciones de esta marca. Corré la ingesta orgánica para traerlas de Meta.
    </p>
  )
}
