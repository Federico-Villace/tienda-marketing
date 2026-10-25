import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, mensajeUsuario, VERSION_PROMPT } from './prompt'

describe('prompt del Analista', () => {
  it('tiene una versión no vacía', () => {
    expect(VERSION_PROMPT).toBe('analista-v3')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    const sha = createHash('sha256').update(INSTRUCCIONES).digest('hex')
    expect(sha).toBe('283a4b5da7718e222ceae3a3f8188a0ad6fb5b655024d1132e11e27fdaa56b06')
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

  it('con varias marcas pide comparar entre marcas y después la lectura sumada, y avisa que la atribución es aproximada', () => {
    expect(INSTRUCCIONES).toMatch(/varias marcas/i)
    expect(INSTRUCCIONES).toMatch(/porMarca/)
    expect(INSTRUCCIONES).toMatch(/aproximada/i)
    expect(INSTRUCCIONES).toMatch(/compartidas/i)
  })

  it('el mensaje de usuario lleva el JSON de agregados', () => {
    const m = mensajeUsuario({ hola: 'mundo' } as never)
    expect(m).toBe('Datos del período (JSON):\n{"hola":"mundo"}')
  })
})
