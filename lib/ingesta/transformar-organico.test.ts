import { describe, it, expect } from 'vitest'
import { ErrorMeta } from '../meta/oauth'
import type { MediaIg, PostFb } from './meta-organico'
import {
  filaMetricaFb,
  filaMetricaIg,
  filaPublicacionFb,
  filaPublicacionIg,
  sinPaginado,
  textoSeguro,
} from './transformar-organico'

const ctx = { organizacionId: 'org-1', cuentaId: 'cuenta-1' }

const insight = (name: string, value: number | Record<string, number>) => ({ name, values: [{ value }] })

const ig = (extra: Partial<MediaIg> = {}): MediaIg => ({
  id: 'ig-1',
  caption: 'Nueva Zontes',
  media_type: 'IMAGE',
  media_product_type: 'FEED',
  permalink: 'https://instagram.com/p/x',
  media_url: 'https://cdn/x.jpg',
  timestamp: '2026-10-01T15:00:00+0000',
  insights: {
    data: [
      insight('views', 100),
      insight('reach', 80),
      insight('likes', 10),
      insight('comments', 3),
      insight('shares', 2),
      insight('saved', 5),
    ],
  },
  ...extra,
})

const fb = (extra: Partial<PostFb> = {}): PostFb => ({
  id: 'fb-1',
  message: 'Hola',
  created_time: '2026-10-02T12:00:00+0000',
  permalink_url: 'https://facebook.com/p',
  full_picture: 'https://cdn/y.jpg',
  reactions: { summary: { total_count: 7 } },
  comments: { summary: { total_count: 2 } },
  insights: {
    data: [
      insight('post_media_view', 500),
      insight('post_reactions_by_type_total', { like: 7 }),
      insight('post_clicks', 12),
    ],
  },
  ...extra,
})

describe('sinPaginado', () => {
  it('saca toda clave paging, a cualquier profundidad (trae access_token en la URL)', () => {
    const limpio = sinPaginado({
      a: { paging: { next: 'https://x?access_token=PT-1' }, b: [{ paging: { previous: 'p' }, ok: 1 }] },
      paging: { next: 'n' },
      c: 2,
    })
    expect(JSON.stringify(limpio)).not.toContain('paging')
    expect(JSON.stringify(limpio)).not.toContain('PT-1')
    expect(limpio).toEqual({ a: { b: [{ ok: 1 }] }, c: 2 })
  })
})

describe('textoSeguro', () => {
  it('redacta los tokens conocidos', () => {
    const t = textoSeguro(new Error('falló con BT-123 y PT-456'), ['BT-123', 'PT-456'])
    expect(t).toBe('falló con *** y ***')
  })

  it('redacta access_token= aunque el token no sea conocido', () => {
    const t = textoSeguro(new Error('GET https://g/x?fields=a&access_token=ZZZ999&limit=1 falló'), [])
    expect(t).not.toContain('ZZZ999')
    expect(t).toContain('access_token=***')
  })

  it('describe los errores de Meta con su código', () => {
    const t = textoSeguro(new ErrorMeta('Token PT-1 inválido', { codigo: 190 }), ['PT-1'])
    expect(t).toBe('(#190) Token *** inválido')
  })
})

describe('tipos', () => {
  it.each([
    [{ media_type: 'IMAGE', media_product_type: 'REELS' }, 'reel'],
    [{ media_type: 'VIDEO', media_product_type: 'REELS' }, 'reel'],
    [{ media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED' }, 'carrusel'],
    [{ media_type: 'IMAGE', media_product_type: 'FEED' }, 'imagen'],
    [{ media_type: 'VIDEO', media_product_type: 'FEED' }, 'video'],
    [{ media_type: 'RARO' as never }, 'imagen'],
  ])('IG %o -> %s', (extra, esperado) => {
    expect(filaPublicacionIg(ig(extra as Partial<MediaIg>), ctx).tipo).toBe(esperado)
  })

  it.each([
    [{ media_type: 'album' }, 'carrusel'],
    [{ media_type: 'video_inline' }, 'video'],
    [{ type: 'video_direct_response' }, 'video'],
    [{ media_type: 'photo' }, 'imagen'],
    [{ media_type: 'algo_nuevo' }, 'imagen'],
  ])('FB adjunto %o -> %s', (adjunto, esperado) => {
    expect(filaFb({ attachments: { data: [adjunto] } }).tipo).toBe(esperado)
  })

  it('FB sin adjuntos -> imagen', () => {
    expect(filaFb({}).tipo).toBe('imagen')
  })
})

const filaFb = (extra: Partial<PostFb>) => filaPublicacionFb(fb(extra), ctx)

describe('filaPublicacion', () => {
  it('IG: campos base', () => {
    expect(filaPublicacionIg(ig(), ctx)).toMatchObject({
      organizacion_id: 'org-1',
      cuenta_id: 'cuenta-1',
      meta_post_id: 'ig-1',
      plataforma: 'instagram',
      permalink: 'https://instagram.com/p/x',
      texto: 'Nueva Zontes',
      media_url: 'https://cdn/x.jpg',
      publicado_en: '2026-10-01T15:00:00+0000',
    })
  })

  it('FB: campos base', () => {
    expect(filaFb({})).toMatchObject({
      meta_post_id: 'fb-1',
      plataforma: 'facebook',
      permalink: 'https://facebook.com/p',
      texto: 'Hola',
      media_url: 'https://cdn/y.jpg',
    })
  })

  it('el crudo no lleva paging ni los insights (esos van a la métrica)', () => {
    const f = filaFb({
      reactions: { summary: { total_count: 1 }, paging: { next: 'https://x?access_token=PT-9' } } as never,
    })
    expect(JSON.stringify(f.crudo)).not.toContain('PT-9')
    expect(JSON.stringify(f.crudo)).not.toContain('paging')
  })
})

describe('filaMetrica', () => {
  const ahora = new Date('2026-10-20T15:00:00Z')

  it('FB: sin shares -> compartidos 0, alcance/guardados/impresiones null', () => {
    expect(filaMetricaFb(fb(), 'pub-1', ahora)).toMatchObject({
      publicacion_id: 'pub-1',
      fecha: '2026-10-20',
      capturado_en: '2026-10-20T15:00:00.000Z',
      vistas: 500,
      me_gusta: 7,
      comentarios: 2,
      compartidos: 0,
      alcance: null,
      guardados: null,
      impresiones: null,
    })
  })

  it('FB: post_clicks va a clics', () => {
    expect(filaMetricaFb(fb(), 'p', ahora).clics).toBe(12)
  })

  it('FB: sin post_clicks, clics queda en null (no 0)', () => {
    const sin = fb({ insights: { data: [insight('post_media_view', 5)] } })
    expect(filaMetricaFb(sin, 'p', ahora).clics).toBeNull()
  })

  it('IG: no hay clics por publicación -> null', () => {
    expect(filaMetricaIg(ig(), 'p', ahora).clics).toBeNull()
  })

  it('FB: con shares los toma', () => {
    expect(filaMetricaFb(fb({ shares: { count: 4 } }), 'p', ahora).compartidos).toBe(4)
  })

  it('FB: el crudo guarda post_clicks y no lleva paging', () => {
    const crudo = JSON.stringify(
      filaMetricaFb(
        fb({ insights: { data: fb().insights!.data, paging: { next: 'https://x?access_token=PT-3' } } as never }),
        'p',
        ahora,
      ).crudo,
    )
    expect(crudo).toContain('post_clicks')
    expect(crudo).not.toContain('paging')
    expect(crudo).not.toContain('PT-3')
  })

  it('IG: las seis métricas a sus columnas', () => {
    expect(filaMetricaIg(ig(), 'pub-2', ahora)).toMatchObject({
      vistas: 100,
      alcance: 80,
      me_gusta: 10,
      comentarios: 3,
      compartidos: 2,
      guardados: 5,
      impresiones: null,
    })
  })

  it('IG: una métrica que falta queda en null (no 0)', () => {
    const m = filaMetricaIg(ig({ insights: { data: [insight('views', 9)] } }), 'p', ahora)
    expect(m).toMatchObject({ vistas: 9, alcance: null, guardados: null })
  })

  it('la fecha es la de Argentina: 2026-10-21T01:30Z es el 20', () => {
    expect(filaMetricaIg(ig(), 'p', new Date('2026-10-21T01:30:00Z')).fecha).toBe('2026-10-20')
  })
})
