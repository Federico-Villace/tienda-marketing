import { describe, it, expect } from 'vitest'
import config from './next.config'

describe('next.config: archivos que viajan en el deploy', () => {
  const incluidos = config.outputFileTracingIncludes ?? {}

  it('la placa lee fuentes, logos y texturas con fs: Next no los ve solo, hay que incluirlos', () => {
    for (const ruta of ['/api/promociones/**', '/api/placa-recursos/**']) {
      expect(incluidos[ruta], ruta).toEqual(expect.arrayContaining(['./assets/logos/**', './assets/texturas/**']))
    }
    expect(incluidos['/api/promociones/**']).toContain('./assets/fuentes/**')
    expect(incluidos['/promocionar/**']).toContain('./assets/logos/**')
  })
})
