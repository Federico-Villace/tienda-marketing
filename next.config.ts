import type { NextConfig } from 'next'

const config: NextConfig = {
  // Next reescribe un bloque en CLAUDE.md en cada arranque. Se deja activo
  // y el bloque commiteado: apagarlo esconde avisos utiles de la version.
  turbopack: { root: import.meta.dirname },
  // La placa de una promocion lee las fuentes con fs (readFile): el trazado de archivos
  // de Next no las ve solo, hay que incluirlas. La clave se compara con picomatch contra
  // la ruta ('/api/promociones/[id]/placa'): '*' no cruza '/', por eso '**'. Lo mismo vale para los
  // logos y las texturas de las plantillas de diseño, y para la ruta que los sirve al navegador.
  outputFileTracingIncludes: {
    '/api/promociones/**': ['./assets/fuentes/**', './assets/logos/**', './assets/texturas/**'],
    '/api/placa-recursos/**': ['./assets/logos/**', './assets/texturas/**'],
    // Las pantallas de promociones leen el manifiesto de logos para mostrar los avisos (¿falta algún logo?).
    '/promocionar/**': ['./assets/logos/**'],
  },
}

export default config
