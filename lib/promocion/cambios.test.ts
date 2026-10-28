import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCambio } from './cambios'
import { HEADER_USUARIO } from '../auth/acceso'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'
import { copyDePrueba, filaPromocion, ID_ESCENA, ID_FOTO, ID_PROMO } from './fixture'
import { MARCAS } from '../datos/marcas'

const entorno = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_xyz' }
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const pedido = (c: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/promociones/${ID_PROMO}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof c === 'string' ? c : JSON.stringify(c),
  })

const ID_TANDA = '55555555-5555-4555-8555-555555555555'
const ID_INSPIRACION = '77777777-7777-4777-8777-777777777777'

type Mundo = {
  rol?: string | null
  fila?: Partial<ReturnType<typeof filaPromocion>> | null
  foto?: 'ok' | 'inexistente' | 'borrada'
  inspiracion?: 'ok' | 'inexistente' | 'borrada'
  escena?: 'propia' | 'ajena' | 'inexistente' | 'sin_imagen' | 'de_tanda' | 'de_otra_tanda'
  rpc?: (args: any) => Response
  textos?: { id: string; opciones: unknown[] } | null
}
function mundo(o: Mundo = {}) {
  const rpcs: { nombre: string; args: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.hostname !== 'abc.supabase.co') throw new Error(`no se llama a ${url.hostname}`)
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/promociones') return json(o.fila === null ? [] : [filaPromocion({ id: ID_PROMO, ...o.fila })])
    if (url.pathname === '/rest/v1/textos_promocion') return json(o.textos ? [o.textos] : [])
    if (url.pathname === '/rest/v1/fotos') {
      // La foto de inspiración se busca con uso=inspiracion; la de la moto, con uso=moto.
      if (url.searchParams.get('uso') === 'eq.inspiracion') {
        if (o.inspiracion === 'inexistente') return json([])
        return json([{ id: ID_INSPIRACION, ruta: o.inspiracion === 'borrada' ? null : 'r', borrada_en: o.inspiracion === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
      }
      if (url.searchParams.get('uso') !== 'eq.moto') throw new Error('la foto de la moto se busca con uso=moto')
      if (o.foto === 'inexistente') return json([])
      return json([{ id: ID_FOTO, ruta: o.foto === 'borrada' ? null : 'r', borrada_en: o.foto === 'borrada' ? '2026-10-20T00:00:00Z' : null }])
    }
    if (url.pathname === '/rest/v1/creativos') {
      if (o.escena === 'inexistente') return json([])
      return json([
        {
          id: ID_ESCENA,
          ruta: o.escena === 'sin_imagen' ? null : 'org/g/1.jpg',
          generaciones:
            o.escena === 'de_tanda'
              ? { promocion_id: null, tanda_id: ID_TANDA }
              : o.escena === 'de_otra_tanda'
                ? { promocion_id: null, tanda_id: '66666666-6666-4666-8666-666666666666' }
                : { promocion_id: o.escena === 'ajena' ? '99999999-9999-4999-8999-999999999999' : ID_PROMO, tanda_id: null },
        },
      ])
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const nombre = url.pathname.split('/').pop()!
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre, args })
      return (o.rpc ?? ((a) => json(filaPromocion({ id: ID_PROMO, revision: a.p_revision + 1 }))))(args)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}

afterEach(() => vi.restoreAllMocks())
const llamar = (c: unknown, m: ReturnType<typeof mundo>, id = ID_PROMO, usuario: string | null = 'u-1') =>
  manejarCambio(pedido(c, usuario), id, entorno, m.f)

describe('acceso', () => {
  it('sin sesión 401 y lector 403, sin RPC', async () => {
    const m = mundo()
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m, ID_PROMO, null)).status).toBe(401)
    const m2 = mundo({ rol: 'lector' })
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m2)).status).toBe(403)
    expect(m2.rpcs).toHaveLength(0)
  })
  it('un id que no es UUID o que no existe es 404', async () => {
    const m = mundo()
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m, 'abc')).status).toBe(404)
    const m2 = mundo({ fila: null })
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m2)).status).toBe(404)
  })
})

describe('forma del pedido (400)', () => {
  it.each([
    ['sin revisión', { aspecto: '1:1' }],
    ['revisión 0', { revision: 0, aspecto: '1:1' }],
    ['revisión como texto', { revision: '1', aspecto: '1:1' }],
    ['sin ningún campo', { revision: 1 }],
    ['un campo desconocido', { revision: 1, costoUsd: 0 }],
    ['un campo de la base', { revision: 1, estado: 'aprobada' }],
    ['una ruta de placa', { revision: 1, placaRuta: 'x' }],
    ['no es un objeto', []],
  ])('%s', async (_n, c) => {
    const m = mundo()
    expect((await llamar(c, m)).status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })
  it('un body que no es JSON', async () => {
    const m = mundo()
    expect((await llamar('no json', m)).status).toBe(400)
  })
})

describe('estado y revisión (409)', () => {
  it('una revisión vieja es 409 sin RPC', async () => {
    const m = mundo({ fila: { revision: 3 } })
    const r = await llamar({ revision: 2, aspecto: '1:1' }, m)
    expect(r.status).toBe(409)
    expect(((await r.json()) as any).error).toBe('Esta promoción cambió: recargá la pantalla.')
    expect(m.rpcs).toHaveLength(0)
  })
  it('una aprobada no se edita: hay que volver a editar', async () => {
    const m = mundo({ fila: { estado: 'aprobada' } })
    const r = await llamar({ revision: 1, aspecto: '1:1' }, m)
    expect(r.status).toBe(409)
    expect(((await r.json()) as any).error).toBe('Está aprobada: tocá "Volver a editar".')
  })
  it('una descartada tampoco', async () => {
    const m = mundo({ fila: { estado: 'descartada' } })
    const r = await llamar({ revision: 1, aspecto: '1:1' }, m)
    expect(r.status).toBe(409)
    expect(((await r.json()) as any).error).toMatch(/descartada/)
  })
  it('si la base responde PT409 (carrera) también es 409', async () => {
    const m = mundo({ rpc: () => json({ message: 'Esta promoción cambió' }, 409) })
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m)).status).toBe(409)
  })
  it('PT404 de la base es 404', async () => {
    const m = mundo({ rpc: () => json({ message: 'no existe' }, 404) })
    expect((await llamar({ revision: 1, aspecto: '1:1' }, m)).status).toBe(404)
  })
})

describe('campos', () => {
  it('mapea a snake_case y manda revisión y usuario a editar_promocion', async () => {
    const m = mundo()
    const r = await llamar(
      { revision: 1, aspecto: '9:16', plantilla: 'catalogo', fondo: 'escenario_ruta', titular: 'Llevátela hoy', modelo: 'Leoncino 500', marcaId: '696225363810951' },
      m,
    )
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([
      {
        nombre: 'editar_promocion',
        args: {
          p_id: ID_PROMO,
          p_revision: 1,
          p_usuario: 'u-1',
          p_campos: { aspecto: '9:16', plantilla: 'catalogo', fondo: 'escenario_ruta', titular: 'Llevátela hoy', modelo: 'Leoncino 500', marca_id: '696225363810951' },
        },
      },
    ])
    expect(((await r.json()) as any).promocion).toMatchObject({ id: ID_PROMO, revision: 2 })
  })
  it('datos se valida igual que en la creación', async () => {
    const m = mundo()
    const malos = await llamar({ revision: 1, datos: { precio: { moneda: 'ARS', monto: '4.500.000' }, promo: { tipo: 'contado', detalle: '' } } }, m)
    expect(malos.status).toBe(400)
    expect(((await malos.json()) as any).errores.length).toBeGreaterThan(0)
    const buenos = await llamar({ revision: 1, datos: { precio: { moneda: 'USD', monto: 5990 }, promo: { tipo: 'contado', detalle: '' } } }, m)
    expect(buenos.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos.datos).toEqual({ precio: { moneda: 'USD', monto: 5990 }, promo: { tipo: 'contado', detalle: '' }, lugar: 'Quilmes', indicaciones: '' })
  })
  it('aspecto, plantilla, fondo, titular y modelo inválidos son 400', async () => {
    for (const c of [{ aspecto: '2:1' }, { plantilla: 'otra' }, { fondo: 'espacio_texto' }, { titular: 'Desde $ 100' }, { titular: '' }, { modelo: 'x' }, { marcaId: 'nope' }]) {
      const m = mundo()
      expect((await llamar({ revision: 1, ...c }, m)).status, JSON.stringify(c)).toBe(400)
      expect(m.rpcs).toHaveLength(0)
    }
  })
  it('plantilla y fondo se pueden vaciar con null', async () => {
    const m = mundo()
    await llamar({ revision: 1, plantilla: null, fondo: null }, m)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ plantilla: null, fondo: null })
  })
})

describe('la foto nueva', () => {
  it('inexistente 404, borrada 410, sin RPC', async () => {
    const m = mundo({ foto: 'inexistente' })
    expect((await llamar({ revision: 1, fotoId: ID_FOTO }, m)).status).toBe(404)
    const m2 = mundo({ foto: 'borrada' })
    expect((await llamar({ revision: 1, fotoId: ID_FOTO }, m2)).status).toBe(410)
    expect(m2.rpcs).toHaveLength(0)
  })
  it('un id de foto inválido es 400', async () => {
    const m = mundo()
    expect((await llamar({ revision: 1, fotoId: 'abc' }, m)).status).toBe(400)
  })
  it('cambiar la foto avisa que se borró la imagen que ya había', async () => {
    const m = mundo({ fila: { escena_creativo_id: ID_ESCENA, foto_id: 'otra' } })
    const r = await llamar({ revision: 1, fotoId: ID_FOTO }, m)
    expect(((await r.json()) as any).avisos).toEqual(['Cambiaste la foto: la imagen que habías generado se descartó.'])
  })
})

describe('la escena', () => {
  it('una escena de esta promoción se acepta', async () => {
    const m = mundo()
    const r = await llamar({ revision: 1, escenaCreativoId: ID_ESCENA }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ escena_creativo_id: ID_ESCENA })
  })
  it('de otra promoción, sin imagen o inexistente es 422', async () => {
    for (const escena of ['ajena', 'sin_imagen', 'inexistente'] as const) {
      const m = mundo({ escena })
      const r = await llamar({ revision: 1, escenaCreativoId: ID_ESCENA }, m)
      expect(r.status, escena).toBe(422)
      expect(((await r.json()) as any).error).toBe('Esa imagen no es de esta promoción.')
      expect(m.rpcs).toHaveLength(0)
    }
  })
  it('la escena compartida de LA TANDA de la que es hija se acepta', async () => {
    const m = mundo({ escena: 'de_tanda', fila: { tanda_id: ID_TANDA } })
    const r = await llamar({ revision: 1, escenaCreativoId: ID_ESCENA }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ escena_creativo_id: ID_ESCENA })
  })
  it('la de OTRA tanda, o la de una tanda siendo suelta, es 422', async () => {
    const otra = mundo({ escena: 'de_otra_tanda', fila: { tanda_id: ID_TANDA } })
    expect((await llamar({ revision: 1, escenaCreativoId: ID_ESCENA }, otra)).status).toBe(422)
    const suelta = mundo({ escena: 'de_tanda', fila: { tanda_id: null } })
    expect((await llamar({ revision: 1, escenaCreativoId: ID_ESCENA }, suelta)).status).toBe(422)
    expect(otra.rpcs.length + suelta.rpcs.length).toBe(0)
  })
  it('pide la tanda de la generación junto con la promoción', async () => {
    const m = mundo()
    await llamar({ revision: 1, escenaCreativoId: ID_ESCENA }, m)
    const u = m.f.mock.calls.map(([x]) => new URL(String(x))).find((x) => x.pathname === '/rest/v1/creativos')!
    expect(u.searchParams.get('select')).toContain('generaciones(promocion_id,tanda_id)')
  })
  it('un id de escena inválido es 400', async () => {
    const m = mundo()
    expect((await llamar({ revision: 1, escenaCreativoId: 'abc' }, m)).status).toBe(400)
  })
  it('null la desvincula sin consultar nada', async () => {
    const m = mundo()
    const r = await llamar({ revision: 1, escenaCreativoId: null }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ escena_creativo_id: null })
  })
})

describe('cambiar el formato', () => {
  it('borra la escena y lo informa', async () => {
    const m = mundo({ fila: { aspecto: '4:5', escena_creativo_id: ID_ESCENA } })
    const r = await llamar({ revision: 1, aspecto: '9:16' }, m)
    const b = (await r.json()) as any
    expect(b.avisos).toEqual(['Cambiaste el formato: la imagen que habías generado se descartó porque tiene otra proporción.'])
  })
  it('sin escena previa o con el mismo formato no avisa nada', async () => {
    const m = mundo({ fila: { aspecto: '4:5', escena_creativo_id: null } })
    expect(((await (await llamar({ revision: 1, aspecto: '9:16' }, m)).json()) as any).avisos).toEqual([])
    const m2 = mundo({ fila: { aspecto: '4:5', escena_creativo_id: ID_ESCENA } })
    expect(((await (await llamar({ revision: 1, aspecto: '4:5' }, m2)).json()) as any).avisos).toEqual([])
  })
})

describe('errores', () => {
  it('un fallo inesperado es 500 sin filtrar detalles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ rpc: () => json({ message: 'boom interno' }, 500) })
    const r = await llamar({ revision: 1, aspecto: '1:1' }, m)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('boom')
  })
  it('siempre filtra por la organización', async () => {
    const m = mundo()
    await llamar({ revision: 1, aspecto: '1:1' }, m)
    const urls = m.f.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/promociones') && u.includes(`organizacion_id=eq.${ORGANIZACION_PILOTO_ID}`))).toBe(true)
  })
})

describe('elegir y editar el texto', () => {
  const opciones = [copyDePrueba({ titular: 'Primera' }), copyDePrueba({ titular: 'Segunda' }), copyDePrueba({ titular: 'Tercera' })]
  const conTextos = { id: 'tx1', opciones }
  const marca = { marca_id: MARCAS[3]!.id }

  it('elegir una opción por su número: el servidor toma el texto guardado y marca que no está editado', async () => {
    const m = mundo({ fila: { ...marca, textos_id: 'tx1' }, textos: conTextos })
    const r = await llamar({ revision: 1, copyOpcion: 2 }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ copy: opciones[1], copy_opcion: 2, copy_editado: false, titular: 'Segunda' })
  })
  it('sin textos guardados no hay nada para elegir (422)', async () => {
    const m = mundo({ fila: { ...marca, textos_id: null } })
    const r = await llamar({ revision: 1, copyOpcion: 1 }, m)
    expect(r.status).toBe(422)
    expect(((await r.json()) as any).error).toBe('Primero pedí los textos.')
    expect(m.rpcs).toHaveLength(0)
  })
  it('la opción tiene que ser 1, 2 o 3', async () => {
    for (const copyOpcion of [0, 4, 1.5, '1']) {
      const m = mundo({ fila: { ...marca, textos_id: 'tx1' }, textos: conTextos })
      expect((await llamar({ revision: 1, copyOpcion }, m)).status).toBe(400)
    }
  })
  it('un texto editado a mano queda marcado como editado y NO se le reemplazan los montos', async () => {
    const editado = copyDePrueba({ titular: 'Primera', copy: 'Ahora $ 9.999.999, aprovechá.' })
    const m = mundo({ fila: { ...marca, textos_id: 'tx1', titular: 'Primera', copy: opciones[0] }, textos: conTextos })
    const r = await llamar({ revision: 1, copy: editado, copyOpcion: 1 }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toMatchObject({ copy: editado, copy_opcion: 1, copy_editado: true })
    expect(m.rpcs[0]!.args.p_campos.copy.copy).toContain('$ 9.999.999')
  })
  it('un texto igual a la opción guardada no cuenta como editado', async () => {
    const m = mundo({ fila: { ...marca, textos_id: 'tx1' }, textos: conTextos })
    await llamar({ revision: 1, copy: opciones[2], copyOpcion: 3 }, m)
    expect(m.rpcs[0]!.args.p_campos.copy_editado).toBe(false)
  })
  it('el titular que la persona ya personalizó no se pisa al elegir otro texto', async () => {
    const m = mundo({ fila: { ...marca, textos_id: 'tx1', titular: 'Mío', copy: opciones[0] }, textos: conTextos })
    await llamar({ revision: 1, copyOpcion: 2 }, m)
    expect(m.rpcs[0]!.args.p_campos).not.toHaveProperty('titular')
  })
  it('el texto pasa por el mismo validador: límites, claves de más y menciones ajenas son 400', async () => {
    for (const copy of [copyDePrueba({ hook: 'a'.repeat(151) }), { ...copyDePrueba(), extra: 1 }, copyDePrueba({ copy: 'Seguinos en @otra_cuenta' }), copyDePrueba({ titular: 'Desde 5' })]) {
      const m = mundo({ fila: { ...marca, textos_id: 'tx1' }, textos: conTextos })
      const r = await llamar({ revision: 1, copy }, m)
      expect(r.status).toBe(400)
      expect(((await r.json()) as any).errores.length).toBeGreaterThan(0)
      expect(m.rpcs).toHaveLength(0)
    }
  })
  it('se puede mencionar la cuenta de la marca de la promoción', async () => {
    const m = mundo({ fila: marca })
    const r = await llamar({ revision: 1, copy: copyDePrueba({ copy: `Seguinos en @${MARCAS[3]!.usuarioIg}` }) }, m)
    expect(r.status).toBe(200)
  })
  it('un texto sin número de opción no toca copy_opcion', async () => {
    const m = mundo({ fila: marca })
    await llamar({ revision: 1, copy: copyDePrueba() }, m)
    expect(m.rpcs[0]!.args.p_campos).not.toHaveProperty('copy_opcion')
    expect(m.rpcs[0]!.args.p_campos.copy_editado).toBe(true)
  })
  it('no se puede borrar el texto con null', async () => {
    const m = mundo({ fila: marca })
    expect((await llamar({ revision: 1, copy: null }, m)).status).toBe(400)
  })
})


describe('descripción del fondo', () => {
  it('se guarda sanitizada (una línea, sin delimitadores)', async () => {
    const m = mundo()
    const r = await llamar({ revision: 1, fondoDescripcion: '  Calle de noche,\n con luces «cálidas»  ' }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ fondo_descripcion: 'Calle de noche, con luces cálidas' })
  })
  it('vacío o null la borra', async () => {
    for (const v of ['', '   ', null]) {
      const m = mundo()
      await llamar({ revision: 1, fondoDescripcion: v }, m)
      expect(m.rpcs[0]!.args.p_campos).toEqual({ fondo_descripcion: null })
    }
  })
  it('más de 300 caracteres o algo que no es texto es 400 en castellano, sin RPC', async () => {
    const m = mundo()
    const r = await llamar({ revision: 1, fondoDescripcion: 'a'.repeat(301) }, m)
    expect(r.status).toBe(400)
    expect(((await r.json()) as any).errores).toEqual(['La descripción del fondo admite hasta 300 caracteres.'])
    expect((await llamar({ revision: 1, fondoDescripcion: 5 }, m)).status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })
})

describe('fondo "Usar solo mi descripción"', () => {
  it('se guarda como un fondo más, junto con la descripción en el mismo pedido', async () => {
    const m = mundo()
    const r = await llamar({ revision: 1, fondo: 'solo_descripcion', fondoDescripcion: 'foto de noche en puerto madero.' }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ fondo: 'solo_descripcion', fondo_descripcion: 'foto de noche en puerto madero.' })
  })
})

describe('posición de la moto y del texto', () => {
  it('izquierda, centro y derecha se guardan; otra cosa es 400', async () => {
    for (const v of ['izquierda', 'centro', 'derecha']) {
      const m = mundo()
      expect((await llamar({ revision: 1, posicionMoto: v }, m)).status).toBe(200)
      expect(m.rpcs[0]!.args.p_campos).toEqual({ posicion_moto: v })
    }
    const m = mundo()
    expect((await llamar({ revision: 1, posicionMoto: 'arriba' }, m)).status).toBe(400)
    expect((await llamar({ revision: 1, posicionMoto: null }, m)).status).toBe(400)
    expect(m.rpcs).toHaveLength(0)
  })
  it('las seis plantillas son válidas', async () => {
    for (const p of ['oferta_abajo', 'oferta_arriba', 'catalogo', 'catalogo_arriba']) {
      const m = mundo()
      expect((await llamar({ revision: 1, plantilla: p }, m)).status, p).toBe(200)
    }
  })
  it('texto al costado con la moto al centro es 422 (sin RPC), venga de donde venga el cambio', async () => {
    const MSJ = 'Si el texto va al costado, la moto tiene que ir a la izquierda o a la derecha.'
    // 1) cambia el diseño y la moto ya estaba al centro
    const m1 = mundo({ fila: { posicion_moto: 'centro' } })
    const r1 = await llamar({ revision: 1, plantilla: 'oferta_costado' }, m1)
    expect(r1.status).toBe(422)
    expect(((await r1.json()) as any).error).toBe(MSJ)
    // 2) cambia la moto al centro y el diseño ya era al costado
    const m2 = mundo({ fila: { plantilla: 'catalogo_costado', posicion_moto: 'derecha' } })
    expect((await llamar({ revision: 1, posicionMoto: 'centro' }, m2)).status).toBe(422)
    // 3) los dos juntos
    const m3 = mundo()
    expect((await llamar({ revision: 1, plantilla: 'oferta_costado', posicionMoto: 'centro' }, m3)).status).toBe(422)
    expect(m1.rpcs.length + m2.rpcs.length + m3.rpcs.length).toBe(0)
  })
  it('el mismo pedido puede cambiar el diseño al costado y mover la moto', async () => {
    const m = mundo({ fila: { posicion_moto: 'centro' } })
    expect((await llamar({ revision: 1, plantilla: 'oferta_costado', posicionMoto: 'izquierda' }, m)).status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ plantilla: 'oferta_costado', posicion_moto: 'izquierda' })
  })
  it('sacar el diseño (null) nunca choca', async () => {
    const m = mundo({ fila: { plantilla: 'oferta_costado', posicion_moto: 'derecha' } })
    expect((await llamar({ revision: 1, plantilla: null }, m)).status).toBe(200)
  })
})

describe('línea extra y titular propios', () => {
  it('la línea extra se guarda recortada; vacío o null la borra', async () => {
    const m = mundo()
    await llamar({ revision: 1, lineaExtra: '  Hot Sale · Solo este fin de semana ' }, m)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ linea_extra: 'Hot Sale · Solo este fin de semana' })
    for (const v of ['', null]) {
      const m2 = mundo()
      await llamar({ revision: 1, lineaExtra: v }, m2)
      expect(m2.rpcs[0]!.args.p_campos).toEqual({ linea_extra: null })
    }
  })
  it('sin emojis, sin teléfonos y con un solo precio: el que cargó la persona', async () => {
    const malos = ['Hot Sale 🔥', 'Escribinos al 11 5555 1234', 'Hoy $ 3.900.000', 'Ahora 30% menos']
    for (const lineaExtra of malos) {
      const m = mundo()
      const r = await llamar({ revision: 1, lineaExtra }, m)
      expect(r.status, lineaExtra).toBe(400)
      expect(m.rpcs).toHaveLength(0)
    }
    const m = mundo()
    expect((await llamar({ revision: 1, lineaExtra: 'Llevátela por $ 4.500.000' }, m)).status).toBe(200)
  })
  it('si en el mismo pedido cambia el precio, la regla mira el precio NUEVO', async () => {
    const m = mundo()
    const datos = { precio: { moneda: 'ARS', monto: 3_900_000 }, promo: { tipo: 'contado', detalle: '' } }
    expect((await llamar({ revision: 1, datos, lineaExtra: 'Hoy $ 3.900.000' }, m)).status).toBe(200)
  })
  it('el largo máximo depende de dónde va el texto: 60 / 36 en la línea extra y 40 / 28 en el titular', async () => {
    const costado = { plantilla: 'oferta_costado', posicion_moto: 'derecha' } as const
    expect((await llamar({ revision: 1, lineaExtra: 'a'.repeat(60) }, mundo())).status).toBe(200)
    expect((await llamar({ revision: 1, lineaExtra: 'a'.repeat(61) }, mundo())).status).toBe(400)
    expect((await llamar({ revision: 1, lineaExtra: 'a'.repeat(36) }, mundo({ fila: costado }))).status).toBe(200)
    const largo = await llamar({ revision: 1, lineaExtra: 'a'.repeat(37) }, mundo({ fila: costado }))
    expect(largo.status).toBe(400)
    expect(((await largo.json()) as any).errores.join(' ')).toMatch(/36/)
    expect((await llamar({ revision: 1, titular: 'a'.repeat(40) }, mundo())).status).toBe(200)
    expect((await llamar({ revision: 1, titular: 'a'.repeat(29) }, mundo({ fila: costado }))).status).toBe(400)
    expect((await llamar({ revision: 1, titular: 'a'.repeat(28) }, mundo({ fila: costado }))).status).toBe(200)
  })
  it('el titular sigue sin números ni emojis', async () => {
    expect((await llamar({ revision: 1, titular: 'Desde $ 100' }, mundo())).status).toBe(400)
    expect((await llamar({ revision: 1, titular: 'Vamos 🔥' }, mundo())).status).toBe(400)
  })
})

describe('la foto de inspiración', () => {
  it('se guarda si existe, es de inspiración y no se borró', async () => {
    const m = mundo()
    const r = await llamar({ revision: 1, inspiracionFotoId: ID_INSPIRACION }, m)
    expect(r.status).toBe(200)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ inspiracion_foto_id: ID_INSPIRACION })
  })
  it('null la quita (sin mirar fotos)', async () => {
    const m = mundo()
    await llamar({ revision: 1, inspiracionFotoId: null }, m)
    expect(m.rpcs[0]!.args.p_campos).toEqual({ inspiracion_foto_id: null })
  })
  it('inexistente (o de la moto) 404, borrada 410, id inválido 400; nada llega a la RPC', async () => {
    const m = mundo({ inspiracion: 'inexistente' })
    const r = await llamar({ revision: 1, inspiracionFotoId: ID_INSPIRACION }, m)
    expect(r.status).toBe(404)
    expect(((await r.json()) as any).error).toBe('No se encontró la foto de inspiración.')
    const m2 = mundo({ inspiracion: 'borrada' })
    expect((await llamar({ revision: 1, inspiracionFotoId: ID_INSPIRACION }, m2)).status).toBe(410)
    const m3 = mundo()
    expect((await llamar({ revision: 1, inspiracionFotoId: 'abc' }, m3)).status).toBe(400)
    expect(m.rpcs.length + m2.rpcs.length + m3.rpcs.length).toBe(0)
  })
  it('cambiar la inspiración NO descarta la imagen que ya había (solo cambia la próxima)', async () => {
    const m = mundo({ fila: { escena_creativo_id: ID_ESCENA } })
    const r = await llamar({ revision: 1, inspiracionFotoId: ID_INSPIRACION }, m)
    expect(((await r.json()) as any).avisos).toEqual([])
  })
})
