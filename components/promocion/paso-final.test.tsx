import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import { PasoFinal } from './paso-final'
import { textoPublicado } from '@/lib/contenidista/limites'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'

const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })
const copy = copyDePrueba()
const aprobada = vistaDePromocion(filaPromocion({ id: 'p1', revision: 7, estado: 'aprobada', copy, plantilla: 'oferta_abajo', escena_creativo_id: 'e', placa_ruta: 'r', placa_hash: 'h' }))
const props = { promocion: aprobada, placa: { url: 'https://x/final.png', descarga: 'https://x/final.png?download=trk-502-4x5.png' }, puedeEditar: true }

beforeEach(() => {
  router.push.mockClear()
  router.refresh.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('<PasoFinal>', () => {
  it('muestra la imagen y la deja bajar con su nombre', () => {
    render(<PasoFinal {...props} />)
    expect(screen.getByAltText(/Imagen final de TRK 502/)).toHaveAttribute('src', 'https://x/final.png')
    const bajar = screen.getByRole('link', { name: 'Descargar imagen' })
    expect(bajar).toHaveAttribute('href', 'https://x/final.png?download=trk-502-4x5.png')
    expect(bajar).toHaveAttribute('download')
  })

  it('"Copiar texto" copia el copy con los hashtags, tal como se publica', async () => {
    const escribir = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText: escribir } })
    render(<PasoFinal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))
    await waitFor(() => expect(escribir).toHaveBeenCalledWith(textoPublicado(copy)))
    expect(await screen.findByRole('status')).toHaveTextContent('Texto copiado')
  })

  it('si el navegador no deja copiar, muestra el texto seleccionado para copiarlo a mano', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denegado') }) } })
    render(<PasoFinal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))
    const area = await screen.findByLabelText('Texto para copiar')
    expect(area).toHaveValue(textoPublicado(copy))
    expect(screen.getByRole('status')).toHaveTextContent(/Copialo a mano/)
  })

  it('sin API de portapapeles también cae al texto seleccionado', async () => {
    vi.stubGlobal('navigator', {})
    render(<PasoFinal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))
    expect(await screen.findByLabelText('Texto para copiar')).toBeInTheDocument()
  })

  it('avisa que publicar en Meta llega en la próxima etapa', () => {
    render(<PasoFinal {...props} />)
    expect(screen.getByText(/Publicar en Meta llega en la próxima etapa/)).toBeInTheDocument()
  })

  it('ofrece armar otra promoción y ver todas', () => {
    render(<PasoFinal {...props} />)
    expect(screen.getByRole('link', { name: 'Armar otra promoción' })).toHaveAttribute('href', '/promocionar/nueva')
    expect(screen.getByRole('link', { name: 'Ver todas las promociones' })).toHaveAttribute('href', '/promocionar')
  })

  it('volver a editar reabre la promoción y lleva al paso 4', async () => {
    const f = vi.fn(async () => json({ promocion: { ...aprobada, estado: 'borrador', revision: 8 } }))
    vi.stubGlobal('fetch', f)
    render(<PasoFinal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a editar' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/promocionar/p1?paso=4'))
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ revision: 7, accion: 'reabrir' })
  })

  it('un lector puede bajar y copiar, pero no reabrir', () => {
    render(<PasoFinal {...props} puedeEditar={false} />)
    expect(screen.getByRole('link', { name: 'Descargar imagen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Volver a editar' })).toBeNull()
  })

  it('sin URL de la imagen lo dice en vez de dejar un botón roto', () => {
    render(<PasoFinal {...props} placa={null} />)
    expect(screen.queryByRole('link', { name: 'Descargar imagen' })).toBeNull()
    expect(screen.getByText(/No se pudo mostrar la imagen/)).toBeInTheDocument()
  })
})
