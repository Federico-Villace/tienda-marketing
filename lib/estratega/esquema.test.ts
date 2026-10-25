import { describe, it, expect } from 'vitest'
import { ESQUEMA_PLAN, FORMATO_ESTRATEGA, FORMATO_RESPALDO } from './esquema'
import { FORMATOS, NIVELES_PRESUPUESTO, PLATAFORMAS } from './tipos'

type Nodo = Record<string, any>

/** Todos los objetos del schema, con su ruta. */
function objetos(n: Nodo, ruta = '$'): [string, Nodo][] {
  const salida: [string, Nodo][] = []
  if (n.type === 'object') {
    salida.push([ruta, n])
    for (const [k, v] of Object.entries(n.properties as Nodo)) salida.push(...objetos(v, `${ruta}.${k}`))
  }
  if (n.type === 'array') salida.push(...objetos(n.items, `${ruta}[]`))
  return salida
}

describe('ESQUEMA_PLAN (strict)', () => {
  it('todo objeto tiene additionalProperties:false y required == sus propiedades', () => {
    const todos = objetos(ESQUEMA_PLAN)
    expect(todos.length).toBeGreaterThan(5)
    for (const [ruta, o] of todos) {
      expect(o.additionalProperties, ruta).toBe(false)
      expect([...o.required].sort(), ruta).toEqual(Object.keys(o.properties).sort())
    }
  })

  it('los campos de primer nivel son los del Plan', () => {
    expect(Object.keys(ESQUEMA_PLAN.properties).sort()).toEqual(
      ['calendario', 'canales', 'fundamentos', 'kpis', 'marcas', 'mensajeCentral', 'objetivo', 'presupuesto', 'publico', 'supuestos', 'ventana'].sort(),
    )
  })

  it('los enums salen de los tipos y los nulos se declaran como unión con null', () => {
    const p = ESQUEMA_PLAN.properties
    expect(p.presupuesto.properties.nivel.enum).toEqual([...NIVELES_PRESUPUESTO])
    expect(p.canales.items.properties.plataforma.enum).toEqual([...PLATAFORMAS])
    expect(p.canales.items.properties.formatos.items.enum).toEqual([...FORMATOS])
    expect(p.presupuesto.properties.montoArs.type).toEqual(['number', 'null'])
    expect(p.presupuesto.properties.nota.type).toEqual(['string', 'null'])
  })

  it('cada pieza del calendario lleva `marca` (texto o null), y es obligatoria para strict', () => {
    const pieza = ESQUEMA_PLAN.properties.calendario.items.properties.piezas.items
    expect(pieza.properties.marca.type).toEqual(['string', 'null'])
    expect(pieza.required).toContain('marca')
  })

  it('sin keywords dudosas para strict (minimum, pattern, maxLength…)', () => {
    expect(JSON.stringify(ESQUEMA_PLAN)).not.toMatch(/"(minimum|maximum|pattern|minLength|maxLength|minItems|maxItems|format)"/)
  })
})

describe('formatos', () => {
  it('FORMATO_ESTRATEGA es json_schema strict con el esquema del plan', () => {
    expect(FORMATO_ESTRATEGA).toEqual({ type: 'json_schema', name: 'plan_campania', strict: true, schema: ESQUEMA_PLAN })
  })
  it('el respaldo es json_object', () => {
    expect(FORMATO_RESPALDO).toEqual({ type: 'json_object' })
  })
})
