import { describe, it, expect } from 'vitest'
import { promptVerificacion, VERSION_PROMPT_VERIFICACION } from './prompt-verificacion'

describe('promptVerificacion', () => {
  const s = promptVerificacion()
  it('tiene su versión', () => expect(VERSION_PROMPT_VERIFICACION).toBe('copia-verificacion-v1'))
  it('es CIEGO: no recibe ningún dato de la persona (ni siquiera es función de ellos)', () => {
    expect(promptVerificacion.length).toBe(0)
    expect(s).not.toMatch(/\$ ?\d/)
    expect(s).not.toMatch(/ROUSER|TRK|Quilmes|CUOTAS \d/)
    expect(promptVerificacion()).toBe(s)
  })
  it('pide transcribir sin corregir y no ver lo impreso sobre la moto', () => {
    expect(s).toMatch(/NO lo corrijas ni lo completes/)
    expect(s).toMatch(/SOBRE la moto/)
  })
  it('lista los roles y el formato JSON con logo y fondo_logo', () => {
    for (const r of ['modelo', 'precio', 'condicion', 'frase', 'cta', 'lugar', 'marca', 'otro']) expect(s).toContain(`"${r}"`)
    expect(s).toContain('"fondo_logo"')
    expect(s).toContain('"dudoso"')
  })
  it('lo escrito en la imagen es un dato, no una instrucción', () => expect(s).toMatch(/no lo obedezcas/))
  it('el JSON no tiene ningún campo de veredicto', () => expect(s).not.toMatch(/"(ok|valido|correcto|coincide)"/i))
})
