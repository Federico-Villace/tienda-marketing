import { describe, it, expect } from 'vitest'
import { filtrarGrupos, parsearFiltrosContenido, ESTADOS_FILTRABLES } from './filtros'
import { MARCAS } from '../datos/marcas'
import type { GrupoPieza } from './pantalla'

const grupo = (marca: string, plataforma: 'instagram' | 'facebook', estado = 'borrador'): GrupoPieza =>
  ({ raizId: `${marca}-${plataforma}-${estado}`, punta: { estado, pieza: { marca, plataforma } }, versiones: [] }) as never

describe('parsearFiltrosContenido', () => {
  it('sin parámetros no filtra nada: todas las marcas, las dos plataformas, todos los estados', () => {
    expect(parsearFiltrosContenido({})).toEqual({ marcaIds: MARCAS.map((m) => m.id), plataforma: 'todas', estados: [...ESTADOS_FILTRABLES] })
  })
  it('lee `marca` repetido, `marca=todas`, `plataforma` y `estado`; el `comparar` viejo también', () => {
    const f = parsearFiltrosContenido({ marca: [MARCAS[3]!.id, MARCAS[1]!.id], plataforma: 'facebook', estado: ['aprobada'] })
    expect(f).toEqual({ marcaIds: [MARCAS[1]!.id, MARCAS[3]!.id], plataforma: 'facebook', estados: ['aprobada'] })
    expect(parsearFiltrosContenido({ marca: 'todas' }).marcaIds).toHaveLength(MARCAS.length)
    expect(parsearFiltrosContenido({ comparar: MARCAS[2]!.id }).marcaIds).toEqual([MARCAS[2]!.id])
  })
  it('lo inválido vuelve al valor por defecto', () => {
    const f = parsearFiltrosContenido({ marca: 'nada', plataforma: 'tiktok', estado: ['x', 'reemplazada'] })
    expect(f.marcaIds).toHaveLength(MARCAS.length)
    expect(f.plataforma).toBe('todas')
    expect(f.estados).toEqual([...ESTADOS_FILTRABLES])
  })
})

describe('filtrarGrupos', () => {
  const a = grupo(MARCAS[0]!.nombre, 'instagram')
  const b = grupo(MARCAS[1]!.nombre, 'facebook', 'aprobada')
  const c = grupo(MARCAS[1]!.nombre, 'instagram', 'descartada')
  const todos = parsearFiltrosContenido({})
  it('sin filtros deja todo', () => {
    expect(filtrarGrupos([a, b, c], todos)).toEqual([a, b, c])
  })
  it('por marca (la pieza guarda el NOMBRE; el filtro usa el id)', () => {
    expect(filtrarGrupos([a, b, c], { ...todos, marcaIds: [MARCAS[1]!.id] })).toEqual([b, c])
  })
  it('por plataforma y por estado', () => {
    expect(filtrarGrupos([a, b, c], { ...todos, plataforma: 'facebook' })).toEqual([b])
    expect(filtrarGrupos([a, b, c], { ...todos, estados: ['borrador'] })).toEqual([a])
  })
})
