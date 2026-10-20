import { describe, it, expect } from 'vitest'
import { validarPlan } from './plan'
import type { Brief, Plan } from './tipos'

const brief: Brief = {
  analisisId: '11111111-1111-4111-8111-111111111111',
  objetivo: 'Vender más',
  marcas: ['Zontes Quilmes', 'Suzuki Quilmes'],
  producto: null,
  presupuestoTopeArs: 500000,
  desde: '2026-11-01',
  hasta: '2026-11-28',
  notas: null,
}

const planOk = (): Plan => ({
  objetivo: 'Subir consultas por mensaje',
  mensajeCentral: 'Probá la moto este mes',
  publico: {
    descripcion: 'Hombres de 25 a 40 de Quilmes y alrededores interesados en motos',
    segmentos: [{ nombre: 'Primera moto', criterio: 'Interés en motos, 22-30 años', porque: 'Es el grupo que más comenta' }],
  },
  marcas: ['Zontes Quilmes'],
  presupuesto: { montoArs: 300000, nivel: 'campania', nota: null },
  ventana: { desde: '2026-11-01', hasta: '2026-11-28' },
  canales: [
    { plataforma: 'instagram', formatos: ['reel', 'carrusel'], porcentaje: 70, porque: 'Mejores vistas' },
    { plataforma: 'facebook', formatos: ['imagen'], porcentaje: 30, porque: 'Comentarios' },
  ],
  calendario: [
    { semana: 1, eje: 'Lanzamiento', piezas: [{ plataforma: 'instagram', formato: 'reel', cantidad: 2, idea: 'Test ride' }] },
    { semana: 2, eje: 'Prueba', piezas: [{ plataforma: 'facebook', formato: 'imagen', cantidad: 1, idea: 'Ficha técnica' }] },
  ],
  kpis: [{ metrica: 'Consultas por mensaje', meta: 'Subir' }],
  fundamentos: ['"Los reels rinden más"'],
  supuestos: ['El stock se mantiene'],
})

const errores = (p: unknown, b: Brief = brief) => {
  const r = validarPlan(p, b)
  return r.ok ? [] : r.errores
}
const con = (cambio: (p: any) => void) => {
  const p = planOk() as any
  cambio(p)
  return p
}

describe('validarPlan · forma', () => {
  it('acepta un plan completo y lo devuelve normalizado', () => {
    const r = validarPlan(planOk(), brief)
    expect(r).toEqual({ ok: true, plan: planOk() })
  })

  it('S15: rechaza un plan al que le falta un campo requerido y lo nombra', () => {
    for (const campo of ['objetivo', 'mensajeCentral', 'publico', 'marcas', 'presupuesto', 'ventana', 'canales', 'calendario', 'kpis', 'fundamentos', 'supuestos']) {
      const e = errores(con((p) => delete p[campo]))
      expect(e.length, campo).toBeGreaterThan(0)
      expect(e.join(' ')).toContain(campo)
    }
  })

  it('S21: no acepta propiedades desconocidas, en ningún nivel', () => {
    expect(errores(con((p) => (p.extra = 1))).length).toBeGreaterThan(0)
    expect(errores(con((p) => (p.presupuesto.extra = 1))).length).toBeGreaterThan(0)
    expect(errores(con((p) => (p.calendario[0].piezas[0].extra = 1))).length).toBeGreaterThan(0)
  })

  it('no es un objeto: error', () => {
    expect(errores(null).length).toBe(1)
    expect(errores('plan').length).toBe(1)
  })

  it('recorta strings y limita objetivo, mensaje e idea', () => {
    const r = validarPlan(con((p) => (p.objetivo = '  hola  ')), brief)
    expect(r.ok && r.plan.objetivo).toBe('hola')
    expect(errores(con((p) => (p.objetivo = 'x'.repeat(301)))).join()).toMatch(/objetivo/)
    expect(errores(con((p) => (p.mensajeCentral = '')))).not.toHaveLength(0)
    expect(errores(con((p) => (p.calendario[0].piezas[0].idea = 'x'.repeat(281)))).join()).toMatch(/idea/)
  })

  it('las marcas del plan deben estar en el brief', () => {
    expect(errores(con((p) => (p.marcas = ['Benelli Store Quilmes']))).join()).toMatch(/marcas/)
    expect(errores(con((p) => (p.marcas = [])))).not.toHaveLength(0)
  })

  it('fundamentos al menos 1; kpis hasta 6', () => {
    expect(errores(con((p) => (p.fundamentos = [])))).not.toHaveLength(0)
    const kpi = { metrica: 'm', meta: 'x' }
    expect(errores(con((p) => (p.kpis = Array(7).fill(kpi))))).not.toHaveLength(0)
    expect(errores(con((p) => (p.kpis = Array(6).fill(kpi))))).toHaveLength(0)
  })
})

describe('validarPlan · canales y presupuesto', () => {
  it('S16: los porcentajes suman 100; 99 y 101 son error', () => {
    expect(errores(planOk())).toHaveLength(0)
    expect(errores(con((p) => (p.canales[1].porcentaje = 29))).join()).toMatch(/100/)
    expect(errores(con((p) => (p.canales[1].porcentaje = 31))).join()).toMatch(/100/)
  })

  it('porcentaje entero 0-100, plataformas sin repetir, 1 a 4 canales, formatos válidos', () => {
    expect(errores(con((p) => (p.canales[0].porcentaje = 70.5)))).not.toHaveLength(0)
    expect(errores(con((p) => (p.canales[1].plataforma = 'instagram')))).not.toHaveLength(0)
    expect(errores(con((p) => (p.canales = [])))).not.toHaveLength(0)
    expect(errores(con((p) => (p.canales[0].formatos = ['gif'])))).not.toHaveLength(0)
    expect(errores(con((p) => (p.canales[0].formatos = [])))).not.toHaveLength(0)
  })

  it('S19: plataforma fuera de instagram/facebook es error', () => {
    expect(errores(con((p) => (p.canales[1].plataforma = 'tiktok'))).join()).toMatch(/plataforma/)
  })

  it('S18: nivel válido; a_definir admite monto null; monto negativo o con a_definir y monto es error', () => {
    expect(errores(con((p) => (p.presupuesto.nivel = 'cuenta'))).join()).toMatch(/nivel/)
    expect(errores(con((p) => { p.presupuesto.nivel = 'a_definir'; p.presupuesto.montoArs = null }))).toHaveLength(0)
    expect(errores(con((p) => (p.presupuesto.montoArs = -1))).join()).toMatch(/monto/)
    expect(errores(con((p) => (p.presupuesto.nivel = 'a_definir'))).join()).toMatch(/monto/)
    expect(errores(con((p) => (p.presupuesto.montoArs = 'mucho')))).not.toHaveLength(0)
  })

  it('el monto no supera el tope del brief; sin tope no hay límite', () => {
    expect(errores(con((p) => (p.presupuesto.montoArs = 500001))).join()).toMatch(/tope/)
    expect(errores(con((p) => (p.presupuesto.montoArs = 500000)))).toHaveLength(0)
    expect(errores(con((p) => (p.presupuesto.montoArs = 9e9)), { ...brief, presupuestoTopeArs: null })).toHaveLength(0)
  })
})

describe('validarPlan · ventana y calendario', () => {
  it('la ventana debe estar dentro del brief y con desde <= hasta', () => {
    expect(errores(con((p) => (p.ventana.desde = '2026-10-31'))).join()).toMatch(/ventana/)
    expect(errores(con((p) => (p.ventana.hasta = '2026-11-29'))).join()).toMatch(/ventana/)
    expect(errores(con((p) => { p.ventana.desde = '2026-11-20'; p.ventana.hasta = '2026-11-10' }))).not.toHaveLength(0)
    expect(errores(con((p) => (p.ventana.desde = 'ayer')))).not.toHaveLength(0)
  })

  it('S17: una semana que arranca después de la ventana es error; dentro pasa', () => {
    const cinco = con((p) => {
      p.calendario = [1, 2, 3, 4, 5].map((s) => ({ ...p.calendario[0], semana: s }))
    })
    // 2026-11-01 + 28 días = 2026-11-29 > hasta (11-28): la semana 5 queda afuera
    expect(errores(cinco).join()).toMatch(/semana 5/)
    const cuatro = con((p) => {
      p.calendario = [1, 2, 3, 4].map((s) => ({ ...p.calendario[0], semana: s }))
    })
    expect(errores(cuatro)).toHaveLength(0)
  })

  it('las semanas son consecutivas desde 1; 1 a 13 semanas', () => {
    expect(errores(con((p) => (p.calendario[1].semana = 3)))).not.toHaveLength(0)
    expect(errores(con((p) => (p.calendario[0].semana = 2)))).not.toHaveLength(0)
    expect(errores(con((p) => (p.calendario = [])))).not.toHaveLength(0)
  })

  it('cantidad entera 1-20 y plataforma de la pieza dentro de los canales', () => {
    expect(errores(con((p) => (p.calendario[0].piezas[0].cantidad = 0)))).not.toHaveLength(0)
    expect(errores(con((p) => (p.calendario[0].piezas[0].cantidad = 21)))).not.toHaveLength(0)
    expect(errores(con((p) => (p.calendario[0].piezas[0].cantidad = 1.5)))).not.toHaveLength(0)
    const sinFb = con((p) => {
      p.canales = [{ plataforma: 'instagram', formatos: ['reel'], porcentaje: 100, porque: 'x' }]
    })
    expect(errores(sinFb).join()).toMatch(/canales/)
  })
})

describe('validarPlan · público solo texto', () => {
  it('S20: un segmento con campos extra (emails, teléfonos, listas) es error', () => {
    expect(errores(con((p) => (p.publico.segmentos[0].emails = ['a@b.com']))).length).toBeGreaterThan(0)
    expect(errores(con((p) => (p.publico.segmentos[0].telefonos = ['1155550000']))).length).toBeGreaterThan(0)
    expect(errores(con((p) => (p.publico.lista = [])))).not.toHaveLength(0)
  })

  it('S20: un texto con patrón de email o teléfono es error', () => {
    expect(errores(con((p) => (p.publico.descripcion = 'Escribir a juan@gmail.com'))).join()).toMatch(/público/)
    expect(errores(con((p) => (p.publico.segmentos[0].criterio = 'Llamar al 011 5555-0000')))).not.toHaveLength(0)
    expect(errores(con((p) => (p.publico.segmentos[0].criterio = '+54 9 11 5555 0000')))).not.toHaveLength(0)
  })

  it('S20: un array de contactos en lugar de segmentos es error', () => {
    expect(errores(con((p) => (p.publico.segmentos = ['a@b.com', '1155550000'])))).not.toHaveLength(0)
  })

  it('edades y rangos no se confunden con teléfonos', () => {
    expect(errores(con((p) => (p.publico.descripcion = 'De 25 a 40 años, 2 de cada 3 compran a crédito en 12 cuotas')))).toHaveLength(0)
  })
})
