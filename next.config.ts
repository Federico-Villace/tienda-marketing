import type { NextConfig } from 'next'

const config: NextConfig = {
  // Next reescribe un bloque en CLAUDE.md en cada arranque. Se deja activo
  // y el bloque commiteado: apagarlo esconde avisos utiles de la version.
  turbopack: { root: import.meta.dirname },
}

export default config
