import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TEXTO_SOLO_VER } from '@/components/ui/aviso-solo-ver'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { DECLARACION_DERECHOS_V1 } from '@/lib/productor/foto'
import { SubirFoto } from './subir-foto'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const blobComprimido = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
const comprimirOk = vi.fn(async () => ({ ok: true as const, blob: blobComprimido, ancho: 1536, alto: 2048 }))
const archivo = () => new File([new Uint8Array([9, 9, 9])], 'IMG_0001.heic', { type: 'image/heic' })

beforeEach(() => {
  router.refresh.mockClear()
  comprimirOk.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

function elegirArchivo(f = archivo()) {
  fireEvent.change(screen.getByLabelText(/Elegir una foto/), { target: { files: [f] } })
}

describe('SubirFoto (F13)', () => {
  it('muestra el texto de la declaración de derechos y el botón Subir deshabilitado', () => {
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} />)
    expect(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto)).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
  })

  it('con archivo pero SIN el checkbox, el botón sigue deshabilitado y no se sube nada', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} />)
    elegirArchivo()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    expect(f).not.toHaveBeenCalled()
  })

  it('con el checkbox pero sin archivo, tampoco habilita', () => {
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} />)
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
  })

  it('comprime y sube un multipart con la foto comprimida y derechos=acepto, y refresca', async () => {
    const f = vi.fn(async () => json({ foto: { id: 'f1', ancho: 1536, alto: 2048, url: 'https://x/f1.jpg' } }, 201))
    vi.stubGlobal('fetch', f)
    const alSubir = vi.fn()
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} alSubir={alSubir} />)
    elegirArchivo()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(comprimirOk).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/fotos')
    const fd = init.body as FormData
    expect(fd.get('derechos')).toBe('acepto')
    const foto = fd.get('foto') as File
    expect(foto.name).toBe('foto.jpg')
    expect(foto.size).toBe(3) // la comprimida, no el original
    expect(alSubir).toHaveBeenCalledWith({ id: 'f1', ancho: 1536, alto: 2048, url: 'https://x/f1.jpg' })
  })

  it('de inspiración: mismo camino (compresión, checkbox de derechos) y el multipart lleva uso=inspiracion', async () => {
    const f = vi.fn(async () => json({ foto: { id: 'f2', ancho: 1200, alto: 800, url: 'https://x/f2.jpg' } }, 201))
    vi.stubGlobal('fetch', f)
    const alSubir = vi.fn()
    render(<SubirFoto puedeEditar uso="inspiracion" comprimirFoto={comprimirOk} alSubir={alSubir} />)
    // el rótulo dice que es de inspiración y el checkbox sigue siendo obligatorio
    expect(screen.getByLabelText(/Elegir una foto de inspiración/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Elegir una foto de inspiración/), { target: { files: [archivo()] } })
    expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(alSubir).toHaveBeenCalledWith({ id: 'f2', ancho: 1200, alto: 800, url: 'https://x/f2.jpg' }))
    const fd = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(fd.get('uso')).toBe('inspiracion')
    expect(fd.get('derechos')).toBe('acepto')
  })

  it('la de la moto no manda "uso": el servidor la toma como moto', async () => {
    const f = vi.fn(async () => json({ foto: { id: 'f1', ancho: 1536, alto: 2048, url: null } }, 201))
    vi.stubGlobal('fetch', f)
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} />)
    elegirArchivo()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData).has('uso')).toBe(false)
  })

  it('si no se puede comprimir muestra el error y no sube', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const mal = vi.fn(async () => ({ ok: false as const, error: 'No se pudo leer la foto. Exportala a JPEG y probá de nuevo.' }))
    render(<SubirFoto puedeEditar comprimirFoto={mal} />)
    elegirArchivo()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Exportala a JPEG')
    expect(f).not.toHaveBeenCalled()
  })

  it.each([
    [413, 'La foto pesa demasiado (máximo 4 MB).'],
    [415, 'Solo se aceptan fotos JPEG.'],
    [422, 'La foto tiene que medir entre 512 y 2048 píxeles de lado.'],
  ])('muestra el error %s del servidor', async (status, mensaje) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: mensaje }, status)))
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} />)
    elegirArchivo()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('no permite un segundo click mientras sube', async () => {
    let resolver!: (r: Response) => void
    const f = vi.fn(() => new Promise<Response>((r) => (resolver = r)))
    vi.stubGlobal('fetch', f)
    render(<SubirFoto puedeEditar comprimirFoto={comprimirOk} />)
    elegirArchivo()
    fireEvent.click(screen.getByLabelText(DECLARACION_DERECHOS_V1.texto))
    fireEvent.click(screen.getByRole('button', { name: 'Subir' }))
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /Subiendo/ })).toBeDisabled()
    resolver(json({ foto: { id: 'f1', ancho: 1, alto: 1, url: null } }, 201))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('el lector ve el aviso y no tiene ni input ni botón', () => {
    render(<SubirFoto puedeEditar={false} comprimirFoto={comprimirOk} />)
    expect(screen.queryByRole('button', { name: 'Subir' })).toBeNull()
    expect(screen.queryByLabelText(/Elegir una foto/)).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(TEXTO_SOLO_VER)).toBeInTheDocument()
  })
})
