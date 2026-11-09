import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARCAS } from '../datos/marcas'
import { avisosLogo, elegirLogo, logosDeMarca, MIN_ANCHO_LOGO, validarManifiesto, type ManifiestoLeido } from './logos'
import { leerManifiesto } from './logos-servidor'

const raiz = join(process.cwd(), 'assets/logos')
const crudo = JSON.parse(readFileSync(join(raiz, 'manifiesto.json'), 'utf8')) as unknown
const ID = Object.fromEntries(MARCAS.map((m) => [m.nombre, m.id])) as Record<string, string>

describe('validarManifiesto', () => {
  const existe = (ruta: string) => existsSync(join(raiz, ruta))

  it('el manifiesto real es válido (todos los archivos existen) y cubre las 7 marcas', () => {
    const r = validarManifiesto(crudo, existe)
    expect(r.ok).toBe(true)
    if (r.ok) for (const m of MARCAS) expect(r.manifiesto.marcas[m.id], m.nombre).toBeDefined()
  })

  it('un archivo inexistente es un error con el nombre del archivo', () => {
    const roto = structuredClone(crudo) as { marcas: Record<string, { logos: { archivo: string }[] }> }
    roto.marcas[ID['Suzuki Quilmes']!]!.logos[0]!.archivo = 'no-existe.png'
    const r = validarManifiesto(roto, existe)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toContain('no-existe.png')
  })

  it('rechaza rutas que se salen de la carpeta (no se sirve cualquier archivo)', () => {
    const roto = structuredClone(crudo) as { marcas: Record<string, { logos: { archivo: string }[] }> }
    roto.marcas[ID['Suzuki Quilmes']!]!.logos[0]!.archivo = '../../.env.local'
    const r = validarManifiesto(roto, () => true)
    expect(r.ok).toBe(false)
  })

  it('rechaza rol, tono o fondo inventados, ids repetidos y marcas que no existen', () => {
    const base = (logo: object, extra: object = {}) => ({
      logo999: { carpeta: '999motos', archivo: '999motos.png', tono: 'color', fondo: 'transparente' },
      marcas: { [MARCAS[1]!.id]: { nombre: 'x', carpeta: 'c', logos: [{ id: 'a', archivo: 'a.png', rol: 'concesionaria', tono: 'claro', fondo: 'transparente', ...logo }] }, ...extra },
    })
    const siempre = () => true
    expect(validarManifiesto(base({ rol: 'otro' }), siempre).ok).toBe(false)
    expect(validarManifiesto(base({ tono: 'rojo' }), siempre).ok).toBe(false)
    expect(validarManifiesto(base({ fondo: 'raro' }), siempre).ok).toBe(false)
    expect(validarManifiesto(base({}, { '123': { nombre: 'y', carpeta: 'c', logos: [] } }), siempre).ok).toBe(false)
    const repetido = base({})
    repetido.marcas[MARCAS[1]!.id]!.logos.push({ id: 'a', archivo: 'b.png', rol: 'marca-moto', tono: 'color', fondo: 'solido' })
    expect(validarManifiesto(repetido, siempre).ok).toBe(false)
    expect(validarManifiesto(base({}), siempre).ok).toBe(true)
  })

  it('no es un objeto → error', () => {
    expect(validarManifiesto(null, () => true).ok).toBe(false)
    expect(validarManifiesto([], () => true).ok).toBe(false)
  })
})

describe('con los logos reales', () => {
  const m = leerManifiesto()

  it('lee el ancho real de cada archivo (PNG, JPG y WebP)', () => {
    const morini = m.marcas[ID['MotoMorini Quilmes']!]!.logos[0]!
    expect(morini.ancho).toBe(195)
    expect(morini.formato).toBe('png')
    const benelli = m.marcas[ID['Benelli Store Quilmes']!]!.logos[0]!
    expect(benelli.ancho).toBe(676)
    expect(benelli.formato).toBe('webp')
    expect(m.marcas[ID['Motoplex Quilmes']!]!.logos.find((l) => l.id === 'vespa')!.formato).toBe('jpeg')
  })

  describe('elegirLogo', () => {
    it('prefiere el tono que contrasta con el fondo; si solo hay uno, lo usa igual', () => {
      expect(elegirLogo(m, ID['Suzuki Quilmes']!, 'oscuro')?.id).toBe('suzuki')
      expect(elegirLogo(m, ID['Benelli Store Quilmes']!, 'claro')?.id).toBe('benelli')
      expect(elegirLogo(m, ID['QJ Motor Quilmes']!, 'oscuro')).toBeNull()
    })
    it('con varios, gana el que contrasta, después el de color', () => {
      const dos: ManifiestoLeido = structuredClone(m)
      const id = ID['Suzuki Quilmes']!
      const base = dos.marcas[id]!.logos[0]!
      dos.marcas[id]!.logos = [
        { ...base, id: 'color', tono: 'color' },
        { ...base, id: 'claro', tono: 'claro' },
        { ...base, id: 'oscuro', tono: 'oscuro' },
      ]
      expect(elegirLogo(dos, id, 'oscuro')?.id).toBe('claro')
      expect(elegirLogo(dos, id, 'claro')?.id).toBe('oscuro')
      dos.marcas[id]!.logos = dos.marcas[id]!.logos.filter((l) => l.id !== 'claro')
      expect(elegirLogo(dos, id, 'oscuro')?.id).toBe('color')
    })
    it('un logo de marca de moto nunca se elige como el de la concesionaria', () => {
      expect(elegirLogo(m, ID['Motoplex Quilmes']!, 'oscuro')?.id).toBe('motoplex')
    })
  })

  it('logosDeMarca: los de rol marca-moto de la concesionaria (para el selector)', () => {
    expect(logosDeMarca(m, ID['Motoplex Quilmes']!).map((l) => l.id)).toEqual(['aprilia', 'moto-guzzi', 'piaggio', 'vespa'])
    expect(logosDeMarca(m, ID['Suzuki Quilmes']!)).toEqual([])
    expect(logosDeMarca(m, 'no-existe')).toEqual([])
  })

  describe('avisosLogo (no bloquean)', () => {
    const codigos = (marca: string, tono: 'oscuro' | 'claro', logoMarca: string | null = null) => avisosLogo(m, ID[marca]!, tono, logoMarca).map((a) => a.codigo)

    it('999motos: sin avisos', () => {
      expect(codigos('999motos', 'oscuro')).toEqual([])
      expect(codigos('999motos', 'claro')).toEqual([])
    })
    it('Moto Morini: baja resolución (195 px)', () => {
      expect(MIN_ANCHO_LOGO).toBe(600)
      expect(codigos('MotoMorini Quilmes', 'oscuro')).toEqual(['baja-resolucion'])
    })
    it('Motoplex: sobre fondo oscuro sin avisos; con un logo de marca en JPG, fondo sólido', () => {
      expect(codigos('Motoplex Quilmes', 'oscuro')).toEqual([])
      expect(codigos('Motoplex Quilmes', 'oscuro', 'vespa')).toEqual(['fondo-solido'])
    })
    it('Benelli y Motoplex: logo blanco sobre fondo claro → poco contraste', () => {
      expect(codigos('Benelli Store Quilmes', 'claro')).toEqual(['poco-contraste'])
      expect(codigos('Motoplex Quilmes', 'claro')).toEqual(['poco-contraste'])
      expect(codigos('Benelli Store Quilmes', 'oscuro')).toEqual([])
    })
    it('Suzuki (color): sin avisos en los dos fondos', () => {
      expect(codigos('Suzuki Quilmes', 'oscuro')).toEqual([])
      expect(codigos('Suzuki Quilmes', 'claro')).toEqual([])
    })
    it('QJ y Zontes: falta el logo, y el mensaje le dice qué pedir', () => {
      expect(codigos('QJ Motor Quilmes', 'oscuro')).toEqual(['falta'])
      const [a] = avisosLogo(m, ID['Zontes Quilmes']!, 'claro')
      expect(a!.mensaje).toContain('Zontes Quilmes')
      expect(a!.mensaje).toMatch(/PNG transparente de 1000 px/)
    })
    it('una marca desconocida no rompe: falta', () => {
      expect(avisosLogo(m, 'no-existe', 'oscuro').map((a) => a.codigo)).toEqual(['falta'])
    })
  })
})
