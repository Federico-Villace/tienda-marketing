import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { INSTRUCCIONES_CAMBIO, instruccionesRespaldoCambio, mensajeCambio, VERSION_PROMPT_CAMBIO } from './prompt-cambio'
import { validarCopyDeIA } from './validar'
import { copyDePrueba, datosDePrueba } from '../fixture'

describe('prompt del cambio de texto de una promoción', () => {
  it('tiene versión propia y el texto está congelado: si cambia, hay que subir la versión', () => {
    expect(VERSION_PROMPT_CAMBIO).toBe('promocion-texto-cambio-v2')
    expect(createHash('sha256').update(INSTRUCCIONES_CAMBIO).digest('hex')).toBe('2565d53e4b55377d373791eb1393a8a78d6722c6bee018444612bc345d418e58')
  })

  it('el titular: sin montos de plata ni emojis; cuotas, años, cilindrada o km solo si están en los datos', () => {
    expect(INSTRUCCIONES_CAMBIO).toMatch(/SIN montos de plata ni emojis/)
    expect(INSTRUCCIONES_CAMBIO).toMatch(/cuotas, años, cilindrada o km SOLO si están en los datos/)
    expect(INSTRUCCIONES_CAMBIO).toContain('Versión del prompt: promocion-texto-cambio-v2.')
  })

  it('las reglas prevalecen sobre el pedido y se prohíben montos, teléfonos y emails', () => {
    expect(INSTRUCCIONES_CAMBIO).toMatch(/las reglas prevalecen siempre/)
    expect(INSTRUCCIONES_CAMBIO).toMatch(/no inventes otros montos/)
    expect(INSTRUCCIONES_CAMBIO).toMatch(/teléfonos, emails, links ni direcciones/)
  })

  it('el respaldo pega el schema', () => {
    expect(instruccionesRespaldoCambio()).toContain('"additionalProperties":false')
  })

  it('sin pedidos anteriores no hay frase de anteriores; con ellos van entre « »', () => {
    const base = { marca: 'Benelli', usuarioIg: 'x', modelo: 'TRK 502', datos: datosDePrueba(), textoActual: copyDePrueba(), pedido: 'más corto' }
    expect(mensajeCambio({ ...base, anteriores: [] })).not.toMatch(/ya se aplicaron/)
    expect(mensajeCambio({ ...base, anteriores: ['a', 'b'] })).toContain('«a»; «b»')
  })
})

describe('validarCopyDeIA', () => {
  const ctx = { usuarioIg: 'benellistorequilmes', fuente: '$ 4.500.000\n4500000\n12 cuotas sin interés' }
  const ok = copyDePrueba()

  it('acepta un texto con las formas y los montos respaldados', () => {
    expect(validarCopyDeIA(ok, ctx)).toMatchObject({ ok: true })
  })
  it('un monto que no está en la fuente es inválido (no se reemplaza)', () => {
    const v = validarCopyDeIA({ ...ok, copy: 'Hoy a $ 1.000.000. Escribinos por DM.' }, ctx)
    expect(v).toMatchObject({ ok: false })
    if (!v.ok) expect(v.errores.join(' ')).toMatch(/montos/)
  })
  it('titular con números sin respaldo, montos o emojis, hashtags de más, emails y mención ajena son inválidos', () => {
    for (const malo of [{ titular: 'Desde 18 cuotas' }, { titular: 'Hoy $ 3.500.000' }, { titular: 'Qué moto 🏍' }, { hashtags: ['#a'] }, { copy: 'Escribí a a@b.com' }, { copy: 'Seguinos en @otra_cuenta' }, { hook: '' }]) {
      expect(validarCopyDeIA({ ...ok, ...malo }, ctx), JSON.stringify(malo)).toMatchObject({ ok: false })
    }
  })
  it('WhatsApp solo si figura en la fuente', () => {
    expect(validarCopyDeIA({ ...ok, cta: 'Escribinos por WhatsApp' }, ctx)).toMatchObject({ ok: false })
    expect(validarCopyDeIA({ ...ok, cta: 'Escribinos por WhatsApp' }, { ...ctx, fuente: `${ctx.fuente}\nWhatsApp 11` })).toMatchObject({ ok: true })
  })
  it('claves de más o de menos son inválidas', () => {
    expect(validarCopyDeIA({ ...ok, extra: 1 }, ctx)).toMatchObject({ ok: false })
    expect(validarCopyDeIA({ titular: 'x' }, ctx)).toMatchObject({ ok: false })
  })
})
