import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import config from './next.config'

const require = createRequire(import.meta.url)
const picomatch = require('next/dist/compiled/picomatch') as (patron: string) => (ruta: string) => boolean

describe('next.config: las fuentes de la placa viajan con el deploy', () => {
  const incluye = config.outputFileTracingIncludes ?? {}

  it('declara las fuentes para las rutas de promociones', () => {
    expect(Object.values(incluye).flat()).toContain('./assets/fuentes/**')
  })

  it('el patrón de ruta alcanza a las dos rutas que componen la placa (anidadas bajo [id])', () => {
    const [patron] = Object.keys(incluye)
    const coincide = picomatch(patron!)
    expect(coincide('/api/promociones/[id]/placa')).toBe(true)
    expect(coincide('/api/promociones/[id]')).toBe(true)
  })

  it('no arrastra las fuentes a las rutas que no las usan', () => {
    const coincide = picomatch(Object.keys(incluye)[0]!)
    expect(coincide('/api/generaciones')).toBe(false)
    expect(coincide('/tablero')).toBe(false)
  })

  it('los archivos existen y traen su licencia', () => {
    for (const f of ['Anton-Regular.ttf', 'Inter-SemiBold.otf', 'OFL-Anton.txt', 'OFL-Inter.txt']) {
      expect(existsSync(join(process.cwd(), 'assets/fuentes', f)), f).toBe(true)
    }
  })
})
