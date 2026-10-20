import { describe, it, expect, vi, afterEach } from 'vitest'
import { manejarCambioPlan } from './cambios'
import { HEADER_USUARIO } from '../auth/acceso'
import { MARCAS } from '../datos/marcas'
import { ORGANIZACION_PILOTO_ID } from '../organizacion'

const entorno = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_xyz',
}
const ID = '22222222-2222-4222-8222-222222222222'
const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status })

const brief = {
  analisisId: '11111111-1111-4111-8111-111111111111',
  objetivo: 'Vender más',
  marcas: [MARCAS[5]!.nombre],
  producto: null,
  presupuestoTopeArs: 500000,
  desde: '2026-11-01',
  hasta: '2026-11-28',
  notas: null,
}
const plan = () => ({
  objetivo: 'Subir consultas',
  mensajeCentral: 'Probá la Zontes',
  publico: { descripcion: 'Hombres de 25 a 40 de Quilmes', segmentos: [] },
  marcas: [MARCAS[5]!.nombre],
  presupuesto: { montoArs: 300000, nivel: 'campania', nota: null },
  ventana: { desde: '2026-11-01', hasta: '2026-11-28' },
  canales: [{ plataforma: 'instagram', formatos: ['reel'], porcentaje: 100, porque: 'Vistas' }],
  calendario: [{ semana: 1, eje: 'Lanzamiento', piezas: [{ plataforma: 'instagram', formato: 'reel', cantidad: 2, idea: 'Test ride' }] }],
  kpis: [],
  fundamentos: ['"3000 vistas"'],
  supuestos: [],
})
const fila = (o: Record<string, unknown> = {}) => ({
  id: ID, raiz_id: ID, padre_id: null, version: 1, origen: 'agente', estado: 'borrador',
  analisis_id: brief.analisisId, brief, plan: plan(), modelo: 'gpt-6-luna', costo_usd: '0.0021',
  creado_en: '2026-10-20T10:00:00+00:00', aprobado_en: null, organizacion_id: ORGANIZACION_PILOTO_ID, ...o,
})

const pedido = (cuerpo: unknown, usuario: string | null = 'u-1') =>
  new Request(`https://app.ejemplo.com/api/planes/${ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(usuario ? { [HEADER_USUARIO]: usuario } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  })

type Mundo = { rol?: string | null; existe?: boolean; rpc?: (nombre: string, args: any) => Response }
function mundo(o: Mundo = {}) {
  const rpcs: { nombre: string; args: any }[] = []
  const f = vi.fn<typeof fetch>(async (u, init) => {
    const url = new URL(String(u))
    if (url.pathname === '/rest/v1/miembros') return json(o.rol === null ? [] : [{ rol: o.rol ?? 'director' }])
    if (url.pathname === '/rest/v1/planes') return json(o.existe === false ? [] : [fila()])
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const nombre = url.pathname.split('/').pop()!
      const args = JSON.parse(String(init?.body))
      rpcs.push({ nombre, args })
      return (o.rpc ?? (() => json(fila({ estado: 'aprobado' }))))(nombre, args)
    }
    throw new Error(`URL inesperada: ${url}`)
  })
  return { f, rpcs }
}

const llamadasA = (f: ReturnType<typeof mundo>['f'], host: string) =>
  f.mock.calls.filter(([u]) => new URL(String(u)).hostname === host)

afterEach(() => vi.restoreAllMocks())

describe('manejarCambioPlan · acceso (S37)', () => {
  it('sin sesión 401', async () => {
    const m = mundo()
    expect((await manejarCambioPlan(pedido({ accion: 'aprobar', version: 1 }, null), ID, entorno, m.f)).status).toBe(401)
    expect(m.f).not.toHaveBeenCalled()
  })

  it('lector 403 y nada cambia', async () => {
    const m = mundo({ rol: 'lector' })
    expect((await manejarCambioPlan(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m.f)).status).toBe(403)
    expect(m.rpcs).toHaveLength(0)
  })

  it('no exige OPENAI_API_KEY (cambiar un estado no cuesta)', async () => {
    const r = await manejarCambioPlan(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, mundo().f)
    expect(r.status).toBe(200)
  })

  it('id que no es uuid o plan inexistente / de otra organización 404', async () => {
    expect((await manejarCambioPlan(pedido({ accion: 'aprobar', version: 1 }), 'no-uuid', entorno, mundo().f)).status).toBe(404)
    const m = mundo({ existe: false })
    expect((await manejarCambioPlan(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m.f)).status).toBe(404)
    expect(m.rpcs).toHaveLength(0)
    const sel = m.f.mock.calls.map(([u]) => new URL(String(u))).find((u) => u.pathname === '/rest/v1/planes')!
    expect(sel.searchParams.get('id')).toBe(`eq.${ID}`)
    expect(sel.searchParams.get('organizacion_id')).toBe(`eq.${ORGANIZACION_PILOTO_ID}`)
  })

  it('acción desconocida, version faltante o JSON roto 400', async () => {
    for (const cuerpo of [{ accion: 'borrar', version: 1 }, { accion: 'aprobar' }, { accion: 'aprobar', version: 'x' }, {}, 'no json']) {
      const m = mundo()
      expect((await manejarCambioPlan(pedido(cuerpo), ID, entorno, m.f)).status, JSON.stringify(cuerpo)).toBe(400)
      expect(m.rpcs).toHaveLength(0)
    }
  })
})

describe('manejarCambioPlan · aprobar y descartar (S32, S35)', () => {
  it('aprobar llama a aprobar_plan con la versión y el usuario', async () => {
    const m = mundo()
    const r = await manejarCambioPlan(pedido({ accion: 'aprobar', version: 3 }, 'u-9'), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ nombre: 'aprobar_plan', args: { p_id: ID, p_version: 3, p_usuario: 'u-9' } }])
    expect((await r.json()).plan).toMatchObject({ id: ID, estado: 'aprobado' })
  })

  it('descartar llama a descartar_plan', async () => {
    const m = mundo({ rpc: () => json(fila({ estado: 'descartado' })) })
    const r = await manejarCambioPlan(pedido({ accion: 'descartar', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs).toEqual([{ nombre: 'descartar_plan', args: { p_id: ID, p_version: 1 } }])
    expect((await r.json()).plan.estado).toBe('descartado')
  })
})

describe('manejarCambioPlan · editar (S30, S31)', () => {
  it('un plan válido llama a editar_plan y devuelve la versión nueva', async () => {
    const m = mundo({ rpc: () => json(fila({ id: 'v2', padre_id: ID, version: 2, origen: 'edicion', costo_usd: 0 })) })
    const editado = { ...plan(), objetivo: '  Otro objetivo  ' }
    const r = await manejarCambioPlan(pedido({ plan: editado, version: 1 }, 'u-9'), ID, entorno, m.f)
    expect(r.status).toBe(200)
    expect(m.rpcs).toHaveLength(1)
    expect(m.rpcs[0]!.nombre).toBe('editar_plan')
    expect(m.rpcs[0]!.args).toMatchObject({ p_id: ID, p_version: 1, p_usuario: 'u-9' })
    // Se manda el plan ya normalizado por validarPlan.
    expect(m.rpcs[0]!.args.p_plan.objetivo).toBe('Otro objetivo')
    expect((await r.json()).plan).toMatchObject({ version: 2, origen: 'edicion', costoUsd: 0 })
  })

  it('S31: un plan inválido responde 422 con los errores y no llama a la base', async () => {
    const m = mundo()
    const r = await manejarCambioPlan(pedido({ plan: { ...plan(), canales: [] }, version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(422)
    expect((await r.json()).errores.join()).toMatch(/canales/)
    expect(m.rpcs).toHaveLength(0)
  })

  it('se valida contra el brief guardado del plan (marcas y fechas)', async () => {
    const m = mundo()
    const r = await manejarCambioPlan(pedido({ plan: { ...plan(), marcas: ['Suzuki Quilmes'] }, version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(422)
  })
})

describe('manejarCambioPlan · concurrencia y límites (S36, S38)', () => {
  it.each(['aprobar', 'descartar'])('S36: PT409 de la base (%s) responde 409', async (accion) => {
    const m = mundo({ rpc: () => json({ code: 'PT409', message: 'Este plan cambió: recargá' }, 409) })
    const r = await manejarCambioPlan(pedido({ accion, version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/cambió/)
  })

  it('editar sobre una versión vieja también responde 409', async () => {
    const m = mundo({ rpc: () => json({ code: 'PT409', message: 'x' }, 409) })
    expect((await manejarCambioPlan(pedido({ plan: plan(), version: 1 }), ID, entorno, m.f)).status).toBe(409)
  })

  it('otro fallo de la base es 500 genérico, sin filtrar el mensaje', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = mundo({ rpc: () => json({ message: 'relation secreta no existe' }, 500) })
    const r = await manejarCambioPlan(pedido({ accion: 'aprobar', version: 1 }), ID, entorno, m.f)
    expect(r.status).toBe(500)
    expect(await r.text()).not.toContain('secreta')
  })

  it('S38: ninguna acción llama a OpenAI ni a Meta', async () => {
    for (const cuerpo of [{ accion: 'aprobar', version: 1 }, { accion: 'descartar', version: 1 }, { plan: plan(), version: 1 }]) {
      const m = mundo()
      await manejarCambioPlan(pedido(cuerpo), ID, { ...entorno, OPENAI_API_KEY: 'sk-x' }, m.f)
      expect(llamadasA(m.f, 'api.openai.com')).toHaveLength(0)
      for (const [u] of m.f.mock.calls) {
        expect(new URL(String(u)).hostname).not.toMatch(/openai|facebook|instagram/)
      }
    }
  })
})
