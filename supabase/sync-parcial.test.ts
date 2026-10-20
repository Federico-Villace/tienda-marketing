import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261023120000_sync_parcial.sql'), 'utf8')
// Sin comentarios: lo que cuenta es el SQL ejecutable.
const ejecutable = sql.replace(/--.*$/gm, '')

describe('migración del estado "parcial" en sincronizaciones', () => {
  it('agrega el valor al enum estado_sync, idempotente', () => {
    expect(ejecutable).toMatch(/alter type estado_sync add value if not exists 'parcial'/i)
  })

  it('es solo eso: ALTER TYPE ADD VALUE no se puede usar en la misma transacción que el valor nuevo', () => {
    const sentencias = ejecutable.split(';').map((x) => x.trim()).filter(Boolean)
    expect(sentencias).toHaveLength(1)
  })
})
