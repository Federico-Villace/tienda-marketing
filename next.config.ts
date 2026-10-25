import type { NextConfig } from 'next'

const config: NextConfig = {
  // Next reescribe un bloque en CLAUDE.md en cada arranque. Se deja activo
  // y el bloque commiteado: apagarlo esconde avisos utiles de la version.
  turbopack: { root: import.meta.dirname },
  // La placa de una promocion lee las fuentes con fs (readFile): el trazado de archivos
  // de Next no las ve solo, hay que incluirlas. La clave se compara con picomatch contra
  // la ruta ('/api/promociones/[id]/placa'): '*' no cruza '/', por eso '**'.
  outputFileTracingIncludes: {
    '/api/promociones/**': ['./assets/fuentes/**'],
  },
}

export default config
