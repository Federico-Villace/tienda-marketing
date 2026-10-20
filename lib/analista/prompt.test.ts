import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, mensajeUsuario, VERSION_PROMPT } from './prompt'

describe('prompt del Analista', () => {
  it('tiene una versión no vacía', () => {
    expect(VERSION_PROMPT).toBe('analista-v1')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    const sha = createHash('sha256').update(INSTRUCCIONES).digest('hex')
    expect(sha).toBe('62cfccaab447fa28a9874c806a2433ffc801d70bb408381b787fea1229054261')
  })

  it('exige usar solo cifras del JSON y no atribuir la publicidad a la marca', () => {
    expect(INSTRUCCIONES).toMatch(/SOLO cifras/)
    expect(INSTRUCCIONES).toMatch(/no la atribuyas/)
  })

  it('el mensaje de usuario lleva el JSON de agregados', () => {
    const m = mensajeUsuario({ hola: 'mundo' } as never)
    expect(m).toBe('Datos del período (JSON):\n{"hola":"mundo"}')
  })
})
