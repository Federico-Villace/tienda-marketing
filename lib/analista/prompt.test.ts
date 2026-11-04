import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, INSTRUCCIONES_RESPALDO, mensajeUsuario, VERSION_PROMPT } from './prompt'

describe('prompt del Analista', () => {
  it('tiene una versión no vacía', () => {
    expect(VERSION_PROMPT).toBe('analista-v5')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    const sha = createHash('sha256').update(INSTRUCCIONES).digest('hex')
    expect(sha).toBe('30bdc0bab88193948c8407d6d2ff6bc4c584aa7ada27dd1d2323ac40bb2e067f')
  })

  it('le dice que las publicaciones con pauta no se comparan y que no recomiende repetir un post por sus vistas', () => {
    expect(INSTRUCCIONES).toMatch(/Las publicaciones con pauta no se comparan con las orgánicas/)
    expect(INSTRUCCIONES).toMatch(/no recomiendes repetir un post por sus vistas si tuvo pauta/)
  })

  it('exige citar ids de hechos y no escribir cifras que no estén en ellos', () => {
    expect(INSTRUCCIONES).toMatch(/cita de 1 a 3 ids/)
    expect(INSTRUCCIONES).toMatch(/solo cifras que estén en los hechos/)
    expect(INSTRUCCIONES).toMatch(/Las ideas no llevan precios/)
  })

  it('pide los números en formato argentino (coma decimal, punto de miles)', () => {
    expect(INSTRUCCIONES).toMatch(/formato argentino: coma para los decimales/)
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
