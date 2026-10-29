import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { CrearImagen } from '@/components/creativos/crear-imagen'
import { PasoPlaca } from '@/components/promocion/paso-placa'
import { piezaImagenDePrueba } from '@/components/creativos/fixture'
import { opcionesDeImagen } from '@/lib/imagenes/opciones'
import { vistaDePromocion } from '@/lib/promocion/vista'
import { copyDePrueba, filaPromocion } from '@/lib/promocion/fixture'

const promo = vistaDePromocion(filaPromocion({ id: 'p1', revision: 5, copy: copyDePrueba(), copy_opcion: 1, plantilla: 'oferta_abajo', fondo: 'fondo_estudio' }))

function renderCreativos() {
  return render(
    <CrearImagen
      piezas={[piezaImagenDePrueba()]}
      fotos={[{ id: 'f1', ancho: 1, alto: 1, creadoEn: '2026-10-27T09:00:00Z', url: 'https://x/f1.jpg', generaciones: [], creativos: [] }]}
      piezaInicialId={null}
      puedeEditar
      apagado={null}
      topeUsd={10}
      gastadoUsd={1}
      opciones={opcionesDeImagen('foto')}
    />,
  )
}
function renderPromocion() {
  return render(
    <PasoPlaca
      promocion={promo}
      marca="Benelli"
      fotoUrl={null}
      escenas={[]}
      placaUrl={null}
      puedeEditar
      apagado={null}
      topeUsd={10}
      gastadoUsd={1}
      motor="gemini-nano-banana-2.1"
      fuentes={{ titulo: 'Anton', texto: 'Inter' }}
      inspiracion={null}
    />,
  )
}

const radios = (grupo: string) => within(screen.getByRole('radiogroup', { name: grupo })).getAllByRole('radio').map((r) => r.closest('label')?.textContent ?? '')
const variantes = () => Array.from(screen.getByLabelText('Variantes').querySelectorAll('option')).map((o) => o.textContent)

describe('Paridad: Promociones y /creativos usan los mismos componentes de imagen', () => {
  it.each([
    ['/creativos', renderCreativos],
    ['promociones', renderPromocion],
  ])('%s arma opciones, compuerta y gasto del mes con los componentes compartidos', (_n, pintar) => {
    pintar()
    expect(screen.getAllByTestId('opciones-imagen')).toHaveLength(1)
    expect(screen.getAllByTestId('compuerta-imagen')).toHaveLength(1)
    expect(screen.getAllByTestId('gasto-del-mes')).toHaveLength(1)
  })

  it('mismos motores y misma cantidad de variantes', () => {
    renderCreativos()
    const a = { motores: radios('Motor'), variantes: variantes() }
    document.body.innerHTML = ''
    renderPromocion()
    expect({ motores: radios('Motor'), variantes: variantes() }).toEqual(a)
  })

  it('los fondos son los mismos, salvo "espacio para texto" que solo existe en /creativos', () => {
    renderCreativos()
    const creativos = radios('Fondo')
    document.body.innerHTML = ''
    renderPromocion()
    const promocion = radios('Fondo')
    expect(creativos.filter((f) => !promocion.includes(f))).toHaveLength(1)
    expect(promocion.every((f) => creativos.includes(f))).toBe(true)
  })
})
