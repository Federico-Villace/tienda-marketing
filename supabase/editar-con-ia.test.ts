import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261105120000_editar_con_ia.sql'), 'utf8')

const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

const sinComentarios = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migración editar-con-ia · generaciones', () => {
  it('gana base_creativo_id e instruccion (3..400) que van juntas', () => {
    expect(sql).toMatch(/add column base_creativo_id uuid references public\.creativos\(id\) on delete restrict/)
    expect(sql).toMatch(/add column instruccion text check \(instruccion is null or char_length\(instruccion\) between 3 and 400\)/)
    expect(sql).toMatch(/generaciones_ajuste_completo check \(\(base_creativo_id is null\) = \(instruccion is null\)\)/)
  })

  it('un cambio nunca es de un lote ni lleva imagen de referencia', () => {
    expect(sql).toMatch(/generaciones_ajuste_sin_lote check \(base_creativo_id is null or lote_id is null\)/)
    expect(sql).toMatch(/generaciones_ajuste_sin_referencia check \(base_creativo_id is null or referencia_foto_id is null\)/)
  })

  it('indexa por base', () => {
    expect(sql).toMatch(/create index on public\.generaciones \(base_creativo_id\)/)
  })
})

describe('migración editar-con-ia · conversaciones y turnos', () => {
  it('conversaciones: una por objeto (promoción o pieza), exactamente una FK', () => {
    expect(sql).toMatch(/create table public\.conversaciones \(/)
    expect(sql).toMatch(/num_nonnulls\(promocion_id, pieza_raiz_id\) = 1/)
    expect(sql).toMatch(/create unique index conversaciones_una_por_promocion on public\.conversaciones \(promocion_id\) where promocion_id is not null/)
    expect(sql).toMatch(/create unique index conversaciones_una_por_pieza on public\.conversaciones \(pieza_raiz_id\) where pieza_raiz_id is not null/)
  })

  it('turnos: pedido 1..400, estados, un solo pendiente por conversación, ok exige respuesta', () => {
    expect(sql).toMatch(/create table public\.turnos_conversacion \(/)
    expect(sql).toMatch(/pedido\s+text not null check \(char_length\(pedido\) between 1 and 400\)/)
    expect(sql).toMatch(/estado in \('pendiente', 'ok', 'error'\)/)
    expect(sql).toMatch(/create unique index turnos_un_pendiente on public\.turnos_conversacion \(conversacion_id\) where estado = 'pendiente'/)
    expect(sql).toMatch(/check \(estado <> 'ok' or respuesta is not null\)/)
    expect(sql).toMatch(/unique \(conversacion_id, turno\)/)
  })

  it('RLS: solo select por pertenencia, ninguna política de escritura (regla #5)', () => {
    for (const t of ['conversaciones', 'turnos_conversacion']) {
      expect(sql).toContain(`alter table public.${t} enable row level security`)
      expect(sql).toMatch(new RegExp(`create policy "lectura por pertenencia" on public\\.${t}\\s+for select using \\(public\\.es_miembro\\(organizacion_id\\)\\)`))
    }
    expect(sinComentarios).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda tokens ni claves (regla #4) y no borra datos', () => {
    expect(sinComentarios).not.toMatch(/\b(token|token_ref|api_key|secret|password)\b/i)
    expect(sinComentarios).not.toMatch(/\bdrop\s+(table|function|column|constraint)/i)
  })

  it('trae la bajada comentada', () => {
    expect(sql).toMatch(/-- BAJADA/)
    expect(sql).toMatch(/-- drop function public\.abrir_turno/)
  })
})

describe('funciones: search_path vacío, solo service_role', () => {
  const firmas: [string, string][] = [
    ['abrir_turno', 'uuid, text, uuid, text, uuid, numeric, integer, numeric, numeric'],
    ['cerrar_turno', 'uuid, jsonb, text, text, jsonb, numeric'],
    ['fallar_turno', 'uuid, text, numeric, jsonb'],
  ]
  for (const [nombre, firma] of firmas) {
    it(`${nombre}: plpgsql, search_path vacío, revoke y grant`, () => {
      const f = funcion(nombre)
      expect(f).toMatch(/language plpgsql/)
      expect(f).toMatch(/set search_path = ''/)
      expect(sql).toContain(`revoke all on function public.${nombre}(${firma}) from public, anon, authenticated;`)
      expect(sql).toContain(`grant execute on function public.${nombre}(${firma}) to service_role;`)
    })
  }
})

describe('abrir_turno · topes', () => {
  const f = () => funcion('abrir_turno')

  it('valida pedido, objeto y topes (22023) y que el objeto exista en la org (PT404)', () => {
    expect(f()).toMatch(/char_length\(p_pedido\) not between 1 and 400[\s\S]*errcode = '22023'/)
    expect(f()).toMatch(/p_objeto not in \('promocion', 'pieza'\)/)
    expect(f()).toMatch(/p_estimado is null or p_estimado < 0/)
    expect(f()).toMatch(/errcode = 'PT404'/)
  })

  it('serializa con el lock de la organización y de la conversación', () => {
    const g = f()
    expect(g).toMatch(/from public\.organizaciones where id = p_org for update/)
    expect(g).toMatch(/from public\.conversaciones[\s\S]*for update/)
  })

  it('vence pendientes de más de 120 s; uno vigente es PT409', () => {
    const g = f()
    expect(g).toMatch(/interval '120 seconds'/)
    expect(g).toMatch(/error = 'vencido'/)
    expect(g).toMatch(/estado = 'pendiente'[\s\S]*errcode = 'PT409'/)
  })

  it('PT429 por turnos, por costo del ítem y por costo del día (Buenos Aires)', () => {
    const g = f()
    expect(g).toMatch(/turnos >= p_max_turnos/)
    expect(g).toMatch(/costo_usd \+ p_estimado > p_tope\b/)
    expect(g).toMatch(/America\/Argentina\/Buenos_Aires/)
    expect(g).toMatch(/> p_tope_diario/)
    expect((g.match(/errcode = 'PT429'/g) ?? []).length).toBe(3)
  })

  it('los topes se chequean ANTES de insertar el turno', () => {
    const g = f()
    expect(g.lastIndexOf("errcode = 'PT429'")).toBeLessThan(g.indexOf('insert into public.turnos_conversacion'))
  })
})

describe('cerrar_turno y fallar_turno', () => {
  it('cerrar: lock, PT404, no pendiente PT409, respuesta objeto 22023, suma turno y costo', () => {
    const g = funcion('cerrar_turno')
    expect(g).toMatch(/from public\.turnos_conversacion where id = p_turno for update/)
    expect(g).toMatch(/errcode = 'PT404'/)
    expect(g).toMatch(/estado <> 'pendiente'[\s\S]*errcode = 'PT409'/)
    expect(g).toMatch(/jsonb_typeof\(p_respuesta\) is distinct from 'object'[\s\S]*errcode = '22023'/)
    expect(g).toMatch(/turnos = turnos \+ 1, costo_usd = costo_usd \+ p_costo/)
  })

  it('fallar: solo si está pendiente, estado error, suma el costo pero no el turno', () => {
    const g = funcion('fallar_turno')
    expect(g).toMatch(/for update/)
    expect(g).toMatch(/estado = 'error'/)
    expect(g).toMatch(/left\(coalesce\(p_error, .error.\), 500\)/)
    expect(g).toMatch(/costo_usd = costo_usd \+ greatest/)
    expect(g).not.toMatch(/turnos = turnos \+ 1/)
  })
})
