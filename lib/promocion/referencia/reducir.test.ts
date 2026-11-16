import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { LADO_MAXIMO_LECTURA, reducirParaLectura } from './reducir'

const imagen = (ancho: number, alto: number, formato: 'jpeg' | 'png' = 'jpeg') =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: '#c33' } })
    [formato]()
    .toBuffer()
    .then((b) => new Uint8Array(b))

describe('reducirParaLectura', () => {
  it('baja una foto grande a 1024 px de lado largo, conserva la proporción y devuelve JPEG', async () => {
    const r = await reducirParaLectura(await imagen(3000, 2000))
    const m = await sharp(r.bytes).metadata()
    expect(LADO_MAXIMO_LECTURA).toBe(1024)
    expect(m.format).toBe('jpeg')
    expect(m.width).toBe(1024)
    expect(m.height).toBe(683)
    expect(r.mimeType).toBe('image/jpeg')
  })

  it('una vertical también (el lado largo es el alto)', async () => {
    const m = await sharp((await reducirParaLectura(await imagen(1080, 2160))).bytes).metadata()
    expect(m.height).toBe(1024)
    expect(m.width).toBe(512)
  })

  it('NUNCA agranda: una foto chica queda con sus medidas', async () => {
    const m = await sharp((await reducirParaLectura(await imagen(400, 300))).bytes).metadata()
    expect(m.width).toBe(400)
    expect(m.height).toBe(300)
  })

  it('un PNG sale como JPEG (el mimeType que se le declara a Gemini es el verdadero)', async () => {
    const r = await reducirParaLectura(await imagen(1500, 1500, 'png'))
    expect((await sharp(r.bytes).metadata()).format).toBe('jpeg')
  })

  it('bytes que no son una imagen: error claro, sin devolver nada', async () => {
    await expect(reducirParaLectura(Uint8Array.from([1, 2, 3]))).rejects.toThrow(/imagen/i)
  })
})
