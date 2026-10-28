import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, INSTRUCCIONES_RESPALDO, mensajeUsuario, VERSION_PROMPT } from './prompt'

describe('prompt del Analista', () => {
  it('tiene una versión no vacía', () => {
    expect(VERSION_PROMPT).toBe('analista-v4')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    const sha = createHash('sha256').update(INSTRUCCIONES).digest('hex')
    expect(sha).toBe('c087cd0d2d9aedc5ca91308d79743b9df9fbbf896c9f24f9222ac732c9b4cee4')
  })

  it('exige citar ids de hechos y no escribir cifras que no estén en ellos', () => {
    expect(INSTRUCCIONES).toMatch(/cita de 1 a 3 ids/)
    expect(INSTRUCCIONES).toMatch(/solo cifras que estén en los hechos/)
    expect(INSTRUCCIONES).toMatch(/Las ideas no llevan precios/)
  })

  it('no atribuye la publicidad a la marca', () => {
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

  it('el plan B pide JSON libre con las mismas claves del schema', () => {
    expect(INSTRUCCIONES_RESPALDO.startsWith(INSTRUCCIONES)).toBe(true)
    for (const clave of ['resumen', 'hace', 'evita', 'proba', 'ideas', 'tipoPromo']) expect(INSTRUCCIONES_RESPALDO).toContain(`"${clave}"`)
  })

  it('el mensaje de usuario lleva el JSON de agregados', () => {
    const m = mensajeUsuario({ hola: 'mundo' } as never)
    expect(m).toBe('Datos del período (JSON):\n{"hola":"mundo"}')
  })
})
