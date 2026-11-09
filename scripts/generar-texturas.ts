/**
 * Genera las texturas del diseño "impactante" en assets/texturas (PNG de gris+alfa).
 *
 *   node scripts/generar-texturas.ts
 *
 * Determinista (PRNG con semilla), sin red y sin variables de entorno. Hay un test que comprueba
 * que lo commiteado es exactamente lo que sale de acá: si se cambia el generador, se corre de nuevo.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEXTURAS } from '../lib/promocion/diseno/texturas.ts'

const carpeta = join(import.meta.dirname, '..', 'assets', 'texturas')
mkdirSync(carpeta, { recursive: true })

for (const t of Object.values(TEXTURAS)) {
  const bytes = t.generar()
  writeFileSync(join(carpeta, t.archivo), bytes)
  console.log(`${t.archivo}: ${t.ancho}×${t.alto}, ${Math.round(bytes.length / 1024)} KB`)
}
