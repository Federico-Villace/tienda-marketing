import { describe, it, expect } from 'vitest'
import { filtrarPublicaciones, hrefTablero, parsearFiltros, VENTANA_DIAS, type Filtros } from './filtros'
import { MARCAS } from './marcas'
import type { Publicacion } from './tipos'

// 2026-10-20 12:00 en Argentina. La ventana de 90 días va del 2026-07-23 al 2026-10-20.
const HOY = new Date('2026-10-20T15:00:00Z')
const LIMITE_INF = '2026-07-23'
const LIMITE_SUP = '2026-10-20'

describe('parsearFiltros', () => {
  it('sin parámetros: los 90 días completos, todas las plataformas, primera marca', () => {
    expect(VENTANA_DIAS).toBe(90)
    expect(parsearFiltros({}, HOY)).toEqual({
      marcaId: MARCAS[0]!.id,
      plataforma: 'todas',
      desde: LIMITE_INF,
      hasta: LIMITE_SUP,
    })
  })

  it('respeta fechas válidas dentro de la ventana', () => {
    const f = parsearFiltros({ desde: '2026-09-01', hasta: '2026-09-30' }, HOY)
    expect([f.desde, f.hasta]).toEqual(['2026-09-01', '2026-09-30'])
  })

  it('desde anterior a la ventana se recorta al borde inferior', () => {
    expect(parsearFiltros({ desde: '2020-01-01' }, HOY).desde).toBe(LIMITE_INF)
  })

  it('hasta en el futuro se recorta a hoy (hora de Argentina)', () => {
    expect(parsearFiltros({ hasta: '2027-01-01' }, HOY).hasta).toBe(LIMITE_SUP)
  })

  it('usa el "hoy" de Argentina: 01:00Z del 21 todavía es el 20', () => {
    const f = parsearFiltros({}, new Date('2026-10-21T01:00:00Z'))
    expect(f.hasta).toBe('2026-10-20')
  })

  it('una fecha con formato inválido o inexistente vuelve al borde', () => {
    const f = parsearFiltros({ desde: 'ayer', hasta: '2026-02-31' }, HOY)
    expect([f.desde, f.hasta]).toEqual([LIMITE_INF, LIMITE_SUP])
  })

  it('si desde > hasta, los invierte', () => {
    const f = parsearFiltros({ desde: '2026-10-01', hasta: '2026-09-01' }, HOY)
    expect([f.desde, f.hasta]).toEqual(['2026-09-01', '2026-10-01'])
  })

  it('plataforma desconocida cae en todas; instagram y facebook se aceptan', () => {
    expect(parsearFiltros({ plataforma: 'tiktok' }, HOY).plataforma).toBe('todas')
    expect(parsearFiltros({ plataforma: 'instagram' }, HOY).plataforma).toBe('instagram')
    expect(parsearFiltros({ plataforma: 'facebook' }, HOY).plataforma).toBe('facebook')
  })

  it('marca conocida se respeta; desconocida cae en la primera', () => {
    expect(parsearFiltros({ marca: MARCAS[2]!.id }, HOY).marcaId).toBe(MARCAS[2]!.id)
    expect(parsearFiltros({ marca: 'inexistente' }, HOY).marcaId).toBe(MARCAS[0]!.id)
  })
})

const pub = (o: Partial<Publicacion>): Publicacion => ({
  id: 'p',
  marcaId: MARCAS[0]!.id,
  plataforma: 'instagram',
  tipo: 'imagen',
  texto: '',
  permalink: null,
  publicadoEn: new Date('2026-09-10T15:00:00Z'),
  vistas: 1,
  alcance: null,
  clics: null,
  meGusta: 0,
  comentarios: 0,
  compartidos: 0,
  guardados: 0,
  ...o,
})

const filtros = (o: Partial<Filtros> = {}): Filtros => ({
  marcaId: MARCAS[0]!.id,
  plataforma: 'todas',
  desde: '2026-09-01',
  hasta: '2026-09-30',
  ...o,
})

describe('filtrarPublicaciones', () => {
  it('con plataforma instagram deja solo Instagram', () => {
    const ps = [pub({ id: 'ig' }), pub({ id: 'fb', plataforma: 'facebook' })]
    expect(filtrarPublicaciones(ps, filtros({ plataforma: 'instagram' })).map((p) => p.id)).toEqual(['ig'])
  })

  it('con todas deja ambas plataformas', () => {
    const ps = [pub({ id: 'ig' }), pub({ id: 'fb', plataforma: 'facebook' })]
    expect(filtrarPublicaciones(ps, filtros()).map((p) => p.id)).toEqual(['ig', 'fb'])
  })

  it('filtra por marca', () => {
    const ps = [pub({ id: 'a' }), pub({ id: 'b', marcaId: MARCAS[1]!.id })]
    expect(filtrarPublicaciones(ps, filtros()).map((p) => p.id)).toEqual(['a'])
  })

  it('descarta lo publicado después de "hasta" inclusive el día entero en hora AR', () => {
    const ps = [
      pub({ id: 'ultimo-dia-noche', publicadoEn: new Date('2026-10-01T01:30:00Z') }), // 22:30 AR del 30/09
      pub({ id: 'dia-siguiente', publicadoEn: new Date('2026-10-01T03:00:00Z') }), // 00:00 AR del 01/10
    ]
    expect(filtrarPublicaciones(ps, filtros()).map((p) => p.id)).toEqual(['ultimo-dia-noche'])
  })

  it('descarta lo anterior a "desde" (hora AR)', () => {
    const ps = [
      pub({ id: 'antes', publicadoEn: new Date('2026-09-01T02:59:00Z') }), // 23:59 AR del 31/08
      pub({ id: 'dentro', publicadoEn: new Date('2026-09-01T03:00:00Z') }),
    ]
    expect(filtrarPublicaciones(ps, filtros()).map((p) => p.id)).toEqual(['dentro'])
  })
})

describe('hrefTablero', () => {
  it('arma la URL con todos los filtros', () => {
    const url = new URL(hrefTablero(filtros(), {}), 'http://x')
    expect(url.pathname).toBe('/tablero')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      marca: MARCAS[0]!.id,
      plataforma: 'todas',
      desde: '2026-09-01',
      hasta: '2026-09-30',
    })
  })

  it('cambia solo lo pedido y conserva el resto', () => {
    const url = new URL(hrefTablero(filtros(), { plataforma: 'facebook' }), 'http://x')
    expect(url.searchParams.get('plataforma')).toBe('facebook')
    expect(url.searchParams.get('desde')).toBe('2026-09-01')
    expect(url.searchParams.get('marca')).toBe(MARCAS[0]!.id)
  })
})
