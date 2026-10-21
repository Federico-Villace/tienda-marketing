import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const NOMBRE = '20261026120000_productor.sql'
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', NOMBRE), 'utf8')
/** Todo lo que está antes del bloque de bajada (comentado) al final. */
const arriba = sql.split('-- BAJADA')[0]!

const funcion = (nombre: string) => {
  const m = arriba.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración del Productor · generaciones', () => {
  it('agrega las columnas de la compuerta con sus checks', () => {
    for (const c of ['pieza_id', 'pieza_raiz_id', 'creado_por', 'cantidad', 'aspecto', 'version_prompt', 'vence_en', 'terminada_en']) {
      expect(arriba).toMatch(new RegExp(`add column ${c}\\b`))
    }
    expect(arriba).toMatch(/cantidad\s+integer check \(cantidad between 1 and 4\)/)
    expect(arriba).toMatch(/aspecto\s+text check \(aspecto in \('1:1', '4:5', '9:16'\)\)/)
  })

  it('los costos pasan a numeric(10,6)', () => {
    expect(arriba).toMatch(/alter column costo_estimado_usd type numeric\(10,6\)/)
    expect(arriba).toMatch(/alter column costo_real_usd type numeric\(10,6\)/)
  })

  it('indexa el gasto del mes y las generaciones por raíz', () => {
    expect(arriba).toMatch(/create index generaciones_mes on generaciones \(organizacion_id, confirmada_en\)/)
    expect(arriba).toMatch(/create index on generaciones \(pieza_raiz_id, creado_en desc\)/)
  })
})

describe('migración del Productor · creativos', () => {
  it('una imagen por fila, con coherencia entre ruta y error', () => {
    expect(arriba).toMatch(/create table creativos/)
    expect(arriba).toMatch(/check \(\(ruta is null\) = \(error is not null\)\)/)
    expect(arriba).toMatch(/check \(not elegida or ruta is not null\)/)
    expect(arriba).toMatch(/unique \(generacion_id, orden\)/)
    expect(arriba).toMatch(/check \(char_length\(error\) <= 500\)/)
    expect(arriba).toMatch(/costo_fuente\s+text not null check \(costo_fuente in \('usage', 'tarifa', 'tope', 'sin_cargo'\)\)/)
  })

  it('una sola elegida por raíz de pieza (índice parcial)', () => {
    expect(arriba).toMatch(/create unique index creativos_una_elegida on creativos \(pieza_raiz_id\) where elegida/)
  })

  it('RLS: solo lectura por pertenencia, sin políticas de escritura', () => {
    expect(arriba).toContain('alter table creativos enable row level security')
    expect(arriba).toMatch(/create policy "lectura por pertenencia" on creativos\s+for select using \(es_miembro\(organizacion_id\)\)/)
    expect(arriba).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda URLs firmadas ni claves', () => {
    expect(arriba).not.toMatch(/\b(token|signed|firmada|api_key|secret|password)\b/i)
  })
})

describe('migración del Productor · bucket privado', () => {
  it('crea el bucket creativos privado e idempotente', () => {
    expect(arriba).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s+values \('creativos', 'creativos', false\)\s+on conflict \(id\) do nothing/,
    )
  })

  it('NO crea políticas sobre storage.objects: solo el servidor accede', () => {
    expect(arriba).not.toMatch(/storage\.objects/)
  })
})

describe('migración del Productor · RPCs', () => {
  const rpcs = [
    ['gasto_generaciones_mes', 'uuid'],
    ['confirmar_generacion', 'uuid, numeric, uuid'],
    ['elegir_creativo', 'uuid, boolean, uuid'],
  ] as const

  for (const [nombre, firma] of rpcs) {
    it(`${nombre}: plpgsql, search_path vacío, solo service_role`, () => {
      const f = funcion(nombre)
      expect(f).toMatch(/language plpgsql/)
      expect(f).toMatch(/set search_path = ''/)
      expect(arriba).toContain(`revoke all on function public.${nombre}(${firma}) from public, anon, authenticated;`)
      expect(arriba).toContain(`grant execute on function public.${nombre}(${firma}) to service_role;`)
    })
  }

  it('nunca concede a anon, authenticated ni public', () => {
    expect(arriba).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('el gasto es del mes calendario de Buenos Aires y cuenta el estimado de lo que está en vuelo', () => {
    const f = funcion('gasto_generaciones_mes')
    expect(f).toMatch(/America\/Argentina\/Buenos_Aires/)
    expect(f).toMatch(/date_trunc\('month'/)
    expect(f).toMatch(/confirmada_en >=/)
    expect(f).toMatch(/coalesce\(g\.costo_real_usd, g\.costo_estimado_usd\)/)
    expect(f).toMatch(/estado in \('confirmada', 'corriendo'\)/)
  })

  it('confirmar serializa por organización (for update) antes de leer el gasto', () => {
    const f = funcion('confirmar_generacion')
    expect(f).toMatch(/from public\.organizaciones where id = v\.organizacion_id for update/)
    expect(f.indexOf('public.organizaciones')).toBeLessThan(f.indexOf('gasto_generaciones_mes'))
    expect(f).toMatch(/p_tope is null or p_tope <= 0/)
    expect(f).toMatch(/errcode = '22023'/)
  })

  it('confirmar mapea 404, 409, 410 y 402 y pasa a confirmada con quién y cuándo', () => {
    const f = funcion('confirmar_generacion')
    for (const c of ['PT404', 'PT409', 'PT410', 'PT402']) expect(f).toContain(`errcode = '${c}'`)
    expect(f).toMatch(/estado <> 'estimada'/)
    expect(f).toMatch(/vence_en < now\(\)/)
    expect(f).toMatch(/estado = 'confirmada', confirmada_por = p_usuario, confirmada_en = now\(\)/)
  })

  it('elegir bloquea los creativos de la raíz, apaga la otra antes de marcar y exige imagen', () => {
    const f = funcion('elegir_creativo')
    expect(f).toMatch(/for update/)
    expect(f).toMatch(/ruta is null/)
    expect(f).toContain("errcode = 'PT409'")
    expect(f).toContain("errcode = 'PT404'")
    expect(f.indexOf('elegida = false')).toBeLessThan(f.indexOf('elegida = true'))
  })
})

describe('migración del Productor · bajada', () => {
  it('trae el SQL de bajada comentado', () => {
    const bajada = sql.split('-- BAJADA')[1] ?? ''
    expect(bajada).toMatch(/-- drop table creativos/)
    expect(bajada).toMatch(/-- delete from storage\.buckets where id = 'creativos'/)
    expect(bajada).toMatch(/-- drop function public\.confirmar_generacion/)
    expect(bajada.split('\n').slice(1).every((l) => l.trim() === '' || l.trim().startsWith('--'))).toBe(true)
  })
})
