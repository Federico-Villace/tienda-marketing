export const TEXTO_SOLO_VER = 'Tu rol solo permite ver. Para crear o aprobar, pedile acceso a Federico.'

/** El único aviso de "solo lectura": lo usan todas las pantallas cuando se ocultan los controles de acción. */
export function AvisoSoloVer() {
  return (
    <p role="note" className="text-sm text-(--color-tenue)">
      {TEXTO_SOLO_VER}
    </p>
  )
}
