/**
 * Sin imports a propósito: lo usan los botones de descarga en el navegador, y `pantalla.ts` arrastra
 * `componer.ts` (next/og, sharp, fs), que no compila para el cliente.
 */

/** "TRK 502" + "4:5" → "trk-502-4x5.png". */
export const nombreDeDescarga = (modelo: string, aspecto: string): string =>
  `${modelo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promocion'}-${aspecto.replace(':', 'x')}.png`
