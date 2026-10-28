import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { ListaPromociones } from './lista'
import type { ItemLista } from '@/lib/promocion/pantalla'
import { armarVista, type Ver } from '@/lib/promocion/lista-vista'
import { MARCAS } from '@/lib/datos/marcas'

const AHORA = new Date('2026-10-25T17:00:00+00:00').getTime()
const filtros = { marcaIds: MARCAS.map((m) => m.id), modelo: '' }
const item = (o: Partial<ItemLista> = {}): ItemLista => ({
  id: 'p1', estado: 'borrador', marcaId: MARCAS[0]!.id, marca: 'Benelli Store Quilmes', modelo: 'TRK 502', precio: '$ 4.500.000', pasoActual: 3,
  tandaId: null, actualizadoEn: '2026-10-25T15:00:00+00:00', miniatura: 'https://x/foto.jpg', descarga: null, ...o,
})
type L = { borradores?: ItemLista[]; aprobadas?: ItemLista[]; descartadas?: ItemLista[] }
function lista(l: L, p: { ver?: Ver; pagina?: number; soloVer?: boolean; conFiltros?: boolean; truncada?: boolean } = {}) {
  const ver = p.ver ?? 'terminar'
  const datos = { borradores: [], aprobadas: [], descartadas: [], ...l }
  return render(<ListaPromociones vista={armarVista(datos, filtros, ver, p.pagina ?? 1)} ver={ver} filtros={filtros} soloVer={p.soloVer} conFiltros={p.conFiltros} truncada={p.truncada} ahora={AHORA} />)
}

describe('<ListaPromociones> · pestañas', () => {
  it('las pestañas son links con el total, conservan los filtros y marcan la actual con aria-current', () => {
    lista({ borradores: [item()], aprobadas: [item({ id: 'a', estado: 'aprobada' })] })
    const nav = screen.getByRole('navigation', { name: 'Ver promociones' })
    expect(within(nav).getByRole('link', { name: 'Para terminar (1)' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Para terminar (1)' })).toHaveAttribute('href', '/promocionar')
    expect(within(nav).getByRole('link', { name: 'Historial (1)' })).toHaveAttribute('href', '/promocionar?ver=historial')
    expect(within(nav).getByRole('link', { name: 'Historial (1)' })).not.toHaveAttribute('aria-current')
  })
  it('"Descartadas" solo aparece si hay alguna (o si estás en esa pestaña)', () => {
    const { unmount } = lista({ borradores: [item()] })
    expect(screen.queryByRole('link', { name: /Descartadas/ })).toBeNull()
    unmount()
    lista({ descartadas: [item({ estado: 'descartada' })] })
    expect(screen.getByRole('link', { name: 'Descartadas (1)' })).toBeInTheDocument()
  })
})

describe('<ListaPromociones> · filas', () => {
  it('un borrador muestra moto, marca, precio, el paso legible y fecha relativa, con UNA acción: Seguir', () => {
    lista({ borradores: [item()] })
    const fila = screen.getByRole('listitem')
    expect(fila).toHaveTextContent('TRK 502')
    expect(fila).toHaveTextContent('Benelli Store Quilmes')
    expect(fila).toHaveTextContent('$ 4.500.000')
    expect(fila).toHaveTextContent('Paso 3 de 6 · Textos')
    expect(fila).toHaveTextContent('hace 2 h')
    expect(within(fila).getByRole('link', { name: /^Seguir/ })).toHaveAttribute('href', '/promocionar/p1?paso=3')
    expect(within(fila).queryByRole('link', { name: /Descargar/ })).toBeNull()
  })
  it('la miniatura es chica y con texto alternativo; sin foto queda un hueco decorativo', () => {
    const { unmount } = lista({ borradores: [item()] })
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Miniatura de TRK 502')
    expect(screen.getByRole('img').className).toMatch(/h-12 w-12/)
    unmount()
    lista({ borradores: [item({ miniatura: null })] })
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('una aprobada dice "Aprobada", tiene "Ver" y la descarga queda en el menú "Más"', () => {
    lista({ aprobadas: [item({ id: 'p2', estado: 'aprobada', pasoActual: 6, descarga: 'https://x/placa.png?download=trk.png' })] }, { ver: 'historial' })
    const fila = screen.getByRole('listitem')
    expect(fila).toHaveTextContent('Aprobada')
    expect(within(fila).getByRole('link', { name: /^Ver/ })).toHaveAttribute('href', '/promocionar/p2?paso=6')
    const mas = within(fila).getByText('Más').closest('details')!
    expect(within(mas).getByRole('link', { name: /Descargar imagen/ })).toHaveAttribute('href', 'https://x/placa.png?download=trk.png')
  })
  it('sin URL de descarga no hay menú "Más" ni botón inventado', () => {
    lista({ aprobadas: [item({ estado: 'aprobada', pasoActual: 6 })] }, { ver: 'historial' })
    expect(screen.queryByText('Más')).toBeNull()
    expect(screen.queryByRole('link', { name: /Descargar imagen/ })).toBeNull()
  })
  it('una descartada solo se puede ver', () => {
    lista({ descartadas: [item({ estado: 'descartada' })] }, { ver: 'descartadas' })
    expect(screen.getByRole('listitem')).toHaveTextContent('Descartada')
    expect(screen.getByRole('link', { name: /^Ver/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Seguir/ })).toBeNull()
  })
  it('solo mira: el lector ve "Ver" y ningún link lo lleva a editar', () => {
    lista({ borradores: [item()] }, { soloVer: true })
    expect(screen.queryByRole('link', { name: /^Seguir/ })).toBeNull()
    expect(screen.getByRole('link', { name: /^Ver/ })).toHaveAttribute('href', '/promocionar/p1?paso=3')
  })
})

describe('<ListaPromociones> · vacíos', () => {
  it('cada pestaña vacía dice qué pasa y, si podés, deja empezar', () => {
    const { unmount } = lista({})
    expect(screen.getByText('No tenés promociones para terminar.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nueva promoción' })).toHaveAttribute('href', '/promocionar/nueva')
    unmount()
    lista({}, { ver: 'historial' })
    expect(screen.getByText(/Todavía no aprobaste ninguna promoción/)).toBeInTheDocument()
  })
  it('el lector no ve el botón de empezar', () => {
    lista({}, { soloVer: true })
    expect(screen.queryByRole('link', { name: 'Nueva promoción' })).toBeNull()
  })
  it('si los filtros no dejan nada lo dice', () => {
    lista({}, { conFiltros: true })
    expect(screen.getByText('Ninguna promoción coincide con los filtros.')).toBeInTheDocument()
  })
})

describe('<ListaPromociones> · tandas', () => {
  const tanda = () => lista({
    borradores: [item({ id: 'h1', tandaId: 'T1', marca: 'Zontes Quilmes', pasoActual: 3 }), item({ id: 'h2', tandaId: 'T1', marca: 'Suzuki Quilmes', pasoActual: 4 })],
    aprobadas: [item({ id: 'h3', tandaId: 'T1', marca: 'Otra', estado: 'aprobada', pasoActual: 6, descarga: 'https://x/c.png' })],
  })
  it('es UNA sola fila con "3 marcas", el progreso y la acción "Seguir con la tanda"', () => {
    tanda()
    const filas = screen.getAllByRole('listitem').filter((li) => li.getAttribute('data-fila') === 'tanda')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveTextContent('TRK 502')
    expect(filas[0]).toHaveTextContent('3 marcas')
    expect(filas[0]).toHaveTextContent('1 de 3 aprobadas')
    expect(screen.getByRole('link', { name: /^Seguir con la tanda/ })).toHaveAttribute('href', '/promocionar/tanda/T1')
  })
  it('las hijas están ocultas hasta tocar "Ver las 3 marcas" (aria-expanded) y salen como subfilas', () => {
    tanda()
    const boton = screen.getByRole('button', { name: 'Ver las 3 marcas' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Retocar solo esta/ })).toBeNull()
    fireEvent.click(boton)
    expect(screen.getByRole('button', { name: 'Ocultar las 3 marcas' })).toHaveAttribute('aria-expanded', 'true')
    const retocar = screen.getAllByRole('link', { name: /Retocar solo esta/ })
    expect(retocar).toHaveLength(2)
    expect(retocar[0]).toHaveAttribute('href', '/promocionar/h1?paso=3')
    expect(screen.getAllByText('Zontes Quilmes').length).toBeGreaterThan(0)
    expect(screen.getByText(/Paso 4 de 6 · Imagen/)).toBeInTheDocument()
    expect(screen.getByText(/^Aprobada ·/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar imagen/ })).toHaveAttribute('href', 'https://x/c.png')
  })
  it('una tanda con todas aprobadas va al historial y sus hijas se pueden ver', () => {
    lista({ aprobadas: [item({ id: 'h1', tandaId: 'T1', estado: 'aprobada', pasoActual: 6 }), item({ id: 'h2', tandaId: 'T1', estado: 'aprobada', pasoActual: 6 })] }, { ver: 'historial' })
    expect(screen.getByRole('link', { name: /^Ver la tanda/ })).toHaveAttribute('href', '/promocionar/tanda/T1')
    expect(screen.getByRole('listitem', { name: undefined, hidden: false })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Ver las 2 marcas' }))
    expect(screen.queryByRole('link', { name: /Retocar solo esta/ })).toBeNull()
    expect(screen.getAllByRole('link', { name: /Ver.*Benelli Store Quilmes/ })).toHaveLength(2)
  })
  it('solo mira: la tanda se puede ver pero no hay links de edición', () => {
    lista({ borradores: [item({ tandaId: 'T1' })] }, { soloVer: true })
    fireEvent.click(screen.getByRole('button', { name: 'Ver la marca' }))
    expect(screen.queryByRole('link', { name: /Seguir con la tanda/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Retocar solo esta/ })).toBeNull()
    expect(screen.getByRole('link', { name: /^Ver la tanda/ })).toHaveAttribute('href', '/promocionar/tanda/T1')
  })
})

describe('<ListaPromociones> · paginación', () => {
  const muchas = () => Array.from({ length: 45 }, (_, i) => item({ id: `p${i}`, actualizadoEn: new Date(2026, 9, 1, 0, i).toISOString() }))
  it('páginas de 20: dice en cuál estás y enlaza anterior/siguiente conservando la pestaña', () => {
    lista({ borradores: muchas() }, { pagina: 2 })
    expect(screen.getAllByRole('listitem')).toHaveLength(20)
    const nav = screen.getByRole('navigation', { name: 'Páginas' })
    expect(nav).toHaveTextContent('Página 2 de 3')
    expect(within(nav).getByRole('link', { name: 'Anterior' })).toHaveAttribute('href', '/promocionar')
    expect(within(nav).getByRole('link', { name: 'Siguiente' })).toHaveAttribute('href', '/promocionar?pagina=3')
  })
  it('con una sola página no hay paginador', () => {
    lista({ borradores: [item()] })
    expect(screen.queryByRole('navigation', { name: 'Páginas' })).toBeNull()
  })
  it('avisa si la lectura llegó al tope', () => {
    lista({ borradores: [item()] }, { truncada: true })
    expect(screen.getByText(/últimas 200 promociones/)).toBeInTheDocument()
  })
})
