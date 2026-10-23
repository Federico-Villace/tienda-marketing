import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, mensajeUsuario, VERSION_PROMPT } from './prompt'

describe('prompt del Analista', () => {
  it('tiene una versión no vacía', () => {
    expect(VERSION_PROMPT).toBe('analista-v2')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    const sha = createHash('sha256').update(INSTRUCCIONES).digest('hex')
    expect(sha).toBe('3bb04272ce5b64371b0f5a85a4931b77328b63080d46d73d10270efb1a5420ef')
  })

  it('exige usar solo cifras del JSON y no atribuir la publicidad a la marca', () => {
    expect(INSTRUCCIONES).toMatch(/SOLO cifras/)
    expect(INSTRUCCIONES).toMatch(/no la atribuyas/)
  })

  it('dice que los mensajes son de la cuenta y que no se atribuyen a publicaciones', () => {
    expect(INSTRUCCIONES).toMatch(/mensajes/i)
    expect(INSTRUCCIONES).toMatch(/no informa qué publicación/i)
    expect(INSTRUCCIONES).toMatch(/nunca/i)
  })

  it('el mensaje de usuario lleva el JSON de agregados', () => {
    const m = mensajeUsuario({ hola: 'mundo' } as never)
    expect(m).toBe('Datos del período (JSON):\n{"hola":"mundo"}')
  })
})
