import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BotonesFormatos } from './botones-formatos'
import type { DepsDescarga } from '@/lib/descargas/descargar'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const deps = (): DepsDescarga => ({ puedeCompartirArchivos: () => false, traerArchivo: vi.fn(), compartir: vi.fn(), clickEnlace: vi.fn(), abrir: vi.fn(), esperar: async () => {} })
afterEach(() => vi.unstubAllGlobals())

describe('<BotonesFormatos>', () => {
  it('hay tres botones, uno por formato', () => {
    render(<BotonesFormatos promocionId="p1" modelo="TRK 502" deps={deps()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('un doble click manda UNA sola llamada a /formatos y baja el archivo con su nombre', async () => {
    let soltar: (r: Response) => void = () => {}
    const f = vi.fn(() => new Promise<Response>((res) => (soltar = res)))
    vi.stubGlobal('fetch', f)
    const d = deps()
    render(<BotonesFormatos promocionId="p1" modelo="TRK 502" deps={d} />)
    const b = screen.getByRole('button', { name: /9:16/ })
    fireEvent.click(b)
    fireEvent.click(b)
    expect(f).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ formato: '9:16' })
    soltar(json({ url: 'https://x/f.png', formato: '9:16', hash: 'h', reutilizada: false }))
    await waitFor(() => expect(d.clickEnlace).toHaveBeenCalledWith('https://x/f.png', 'trk-502-9x16.png'))
  })

  it('un error del servidor se muestra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'El texto del lugar es muy largo para este diseño.' }, 422)))
    render(<BotonesFormatos promocionId="p1" modelo="TRK 502" deps={deps()} />)
    fireEvent.click(screen.getByRole('button', { name: /1:1/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/muy largo/)
  })
})
