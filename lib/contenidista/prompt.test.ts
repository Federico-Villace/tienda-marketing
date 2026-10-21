import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES, instruccionesRespaldo, mensajeUsuario, textoFuente, VERSION_PROMPT } from './prompt'
import { ESQUEMA_TANDA } from './esquema'
import { planDePrueba } from './fixture'

const plan = planDePrueba()

describe('prompt del Contenidista', () => {
  it('tiene versión y la lleva en las instrucciones (S13)', () => {
    expect(VERSION_PROMPT).toBe('contenidista-v1')
    expect(INSTRUCCIONES).toContain('contenidista-v1')
  })

  it('el texto de las instrucciones está congelado: si cambia, hay que subir VERSION_PROMPT', () => {
    expect(createHash('sha256').update(INSTRUCCIONES).digest('hex')).toBe('3dcd1773b552af8ce8c56b1052d0aa70004d3ca9cd730269ca468455e50dbfcf')
  })

  it('S13: exige precios, cuotas, stock y promos solo del plan o las notas, si no [precio]', () => {
    expect(INSTRUCCIONES).toMatch(/SOLO si están escritos en el plan o en las notas/)
    expect(INSTRUCCIONES).toContain('[precio]')
    expect(INSTRUCCIONES).toMatch(/Nunca escribas teléfonos, emails, links ni direcciones/)
  })

  it('S12: el mensaje lleva la semana del plan y las notas, y nada más', () => {
    const m = mensajeUsuario(plan, 1, '2026-11-02', '2026-11-08', 'Insistir con la financiación')
    expect(m).toContain('Semana 1 (2026-11-02 a 2026-11-08)')
    expect(m).toContain('Eje: Lanzamiento')
    expect(m).toContain('Recorrido por el taller')
    expect(m).toContain('Insistir con la financiación')
    expect(m).toContain('"usuarioIg":"999motos"')
    expect(m).toMatch(/Devolvé las piezas en JSON\.$/)
    // Sin presupuesto, KPIs, fundamentos ni la otra semana.
    expect(m).not.toContain('300000')
    expect(m).not.toContain('Encuesta')
    expect(m).not.toContain('"3000 vistas"')
    expect(m).not.toMatch(/https?:|permalink|organizacion|apiKey|sk-/i)
  })

  it('sin notas dice "ninguna"', () => {
    expect(mensajeUsuario(plan, 1, '2026-11-02', '2026-11-08', null)).toContain('Notas del director: ninguna')
  })

  it('textoFuente junta solo texto del plan y las notas (sin fechas ni cantidades)', () => {
    const t = textoFuente(plan, 1, 'Bonificación del 10%')
    expect(t).toContain('Recorrido por el taller')
    expect(t).toContain('Bonificación del 10%')
    expect(t).not.toMatch(/2026|300000/)
  })

  it('el respaldo suma el schema a las instrucciones', () => {
    const r = instruccionesRespaldo()
    expect(r.startsWith(INSTRUCCIONES)).toBe(true)
    expect(r).toContain(JSON.stringify(ESQUEMA_TANDA))
  })
})
