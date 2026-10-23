import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { menuConPrecios } from '@/lib/productor/ediciones'
import { Fotos } from './fotos'
import { creativoDePrueba } from './fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const motores = [{ id: 'gemini-nano-banana-2.1', nombre: 'Nano Banana 2.1', porImagenUsd: 0.0336 }]
const fotoVista = (id: string, o: Record<string, unknown> = {}) => ({
  id, ancho: 1536, alto: 2048, creadoEn: '2026-10-27T09:00:00Z', url: `https://x/${id}.jpg?token=T`, generaciones: [], creativos: [], ...o,
})
const generacion = { id: 'g1', estado: 'ok', motor: 'gemini-nano-banana-2.1', cantidad: 1, costoEstimadoUsd: 0.045, costoRealUsd: 0.035, error: null, creadoEn: '2026-10-27T10:00:00Z', interrumpida: false, edicion: 'fondo_estudio' }
const props = {
  fotos: [fotoVista('f1'), fotoVista('f2', { generaciones: [generacion], creativos: [creativoDePrueba({ id: 'c1', generacionId: 'g1' })] })],
  puedeEditar: true, apagado: null, topeUsd: 10, gastadoUsd: 1, motores, motorPorDefecto: 'gemini-nano-banana-2.1',
  menuPorMotor: { 'gemini-nano-banana-2.1': menuConPrecios('gemini-nano-banana-2.1', 1) },
}

beforeEach(() => router.refresh.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('Fotos: sección "Tus fotos" (F13)', () => {
  it('muestra el aviso de fidelidad y privacidad', () => {
    render(<Fotos {...props} />)
    expect(
      screen.getByText(
        'Revisá que la moto no haya cambiado: forma, color y logos. La foto original nunca se publica ni se comparte; solo se manda a Gemini para editarla.',
      ),
    ).toBeInTheDocument()
  })

  it('lista las fotos y recién al elegir una aparece su menú', () => {
    render(<Fotos {...props} />)
    expect(screen.getAllByRole('button', { name: /Elegir la foto/ })).toHaveLength(2)
    expect(screen.queryByRole('radio')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /Elegir la foto/ })[0]!)
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })

  it('los resultados de la foto salen SIN el botón Elegir', () => {
    render(<Fotos {...props} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Elegir la foto/ })[1]!)
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole('button', { name: /Elegir la imagen|Quitar la imagen/ })).toBeNull()
  })

  it('sin fotos invita a subir la primera', () => {
    render(<Fotos {...props} fotos={[]} />)
    expect(screen.getByText(/Todavía no subiste ninguna foto/)).toBeInTheDocument()
  })

  it('borrar pide confirmación, llama al DELETE y refresca', async () => {
    const f = vi.fn(async () => json({ ok: true, pendiente: false }))
    vi.stubGlobal('fetch', f)
    render(<Fotos {...props} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Elegir la foto/ })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar foto' }))
    expect(f).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/fotos/f1')
  })

  it('si el objeto no se pudo borrar avisa que queda pendiente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, pendiente: true })))
    render(<Fotos {...props} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Elegir la foto/ })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar foto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/pendiente/i)
  })

  it('el lector ve las fotos, el menú y los resultados, pero no sube ni borra', () => {
    render(<Fotos {...props} puedeEditar={false} />)
    expect(screen.queryByRole('button', { name: 'Subir' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /Elegir la foto/ })[0]!)
    expect(screen.queryByRole('button', { name: 'Borrar foto' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Estimar' })).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
  })
})
