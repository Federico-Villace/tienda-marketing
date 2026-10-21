import { describe, it, expect } from 'vitest'
import { ESQUEMA_TANDA, FORMATO_CONTENIDISTA } from './esquema'
import { FORMATOS, PLATAFORMAS } from './tipos'
import { MARCAS } from '../datos/marcas'

type Nodo = Record<string, any>

function objetos(n: Nodo, ruta = '$'): [string, Nodo][] {
  const salida: [string, Nodo][] = []
  if (n.type === 'object') {
    salida.push([ruta, n])
    for (const [k, v] of Object.entries(n.properties as Nodo)) salida.push(...objetos(v, `${ruta}.${k}`))
  }
  if (n.type === 'array') salida.push(...objetos(n.items, `${ruta}[]`))
  return salida
}

describe('ESQUEMA_TANDA (strict)', () => {
  it('todo objeto tiene additionalProperties:false y required == sus propiedades', () => {
    const todos = objetos(ESQUEMA_TANDA)
    expect(todos).toHaveLength(2)
    for (const [ruta, o] of todos) {
      expect(o.additionalProperties, ruta).toBe(false)
      expect([...o.required].sort(), ruta).toEqual(Object.keys(o.properties).sort())
    }
  })

  it('la raíz es un objeto con piezas y la pieza trae las 12 claves de Pieza', () => {
    expect(Object.keys(ESQUEMA_TANDA.properties)).toEqual(['piezas'])
    expect(Object.keys(ESQUEMA_TANDA.properties.piezas.items.properties).sort()).toEqual(
      ['altText', 'briefVisual', 'copy', 'cta', 'fecha', 'formato', 'guion', 'hashtags', 'hook', 'ideaOrigen', 'marca', 'plataforma'].sort(),
    )
  })

  it('los enums salen de los tipos y los nulos son unión con null', () => {
    const p = ESQUEMA_TANDA.properties.piezas.items.properties
    expect(p.marca.enum).toEqual(MARCAS.map((m) => m.nombre))
    expect(p.plataforma.enum).toEqual([...PLATAFORMAS])
    expect(p.formato.enum).toEqual([...FORMATOS])
    expect(p.guion.type).toEqual(['string', 'null'])
    expect(p.altText.type).toEqual(['string', 'null'])
  })

  it('sin keywords dudosas para strict', () => {
    expect(JSON.stringify(ESQUEMA_TANDA)).not.toMatch(/"(minimum|maximum|pattern|minLength|maxLength|minItems|maxItems|format)"/)
  })

  it('FORMATO_CONTENIDISTA es json_schema strict', () => {
    expect(FORMATO_CONTENIDISTA).toEqual({ type: 'json_schema', name: 'tanda_contenido', strict: true, schema: ESQUEMA_TANDA })
  })
})
