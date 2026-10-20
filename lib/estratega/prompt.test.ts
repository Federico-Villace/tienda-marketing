import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, instruccionesRespaldo, mensajeUsuario, VERSION_PROMPT } from './prompt'
import { ESQUEMA_PLAN } from './esquema'
import type { Brief } from './tipos'

const brief: Brief = {
  analisisId: '11111111-1111-4111-8111-111111111111',
  objetivo: 'Vender más',
  marcas: ['Zontes Quilmes'],
  producto: null,
  presupuestoTopeArs: 500000,
  desde: '2026-11-01',
  hasta: '2026-11-28',
  notas: 'El análisis subestima Facebook',
}

describe('prompt del Estratega', () => {
  it('tiene versión', () => {
    expect(VERSION_PROMPT).toBe('estratega-v1')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    expect(createHash('sha256').update(INSTRUCCIONES).digest('hex')).toBe('bb485010fae0537b4ad699b564dd992363814fa1ce779970f7cd95577025f70a')
  })

  it('exige cifras del análisis o del brief, citas textuales, público descriptivo y solo Instagram/Facebook', () => {
    expect(INSTRUCCIONES).toMatch(/No inventes/)
    expect(INSTRUCCIONES).toMatch(/entre comillas/)
    expect(INSTRUCCIONES).toMatch(/Nada de listas/)
    expect(INSTRUCCIONES).toMatch(/Solo Instagram y Facebook/)
  })

  it('el mensaje lleva el texto del análisis y el brief, sin el id del análisis', () => {
    const m = mensajeUsuario('El reel rindió 3000 vistas', brief)
    expect(m).toContain('<<<El reel rindió 3000 vistas>>>')
    expect(m).toContain('"objetivo":"Vender más"')
    expect(m).toContain('"notas":"El análisis subestima Facebook"')
    expect(m).not.toContain(brief.analisisId)
    expect(m).toMatch(/Devolvé el plan en JSON\.$/)
  })

  it('el respaldo suma el schema a las instrucciones y menciona JSON', () => {
    const r = instruccionesRespaldo()
    expect(r.startsWith(INSTRUCCIONES)).toBe(true)
    expect(r).toContain(JSON.stringify(ESQUEMA_PLAN))
  })
})
