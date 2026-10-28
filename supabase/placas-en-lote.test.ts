import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261101120000_placas_en_lote.sql'), 'utf8')

/** Cuerpo de una función: desde su create hasta el `$$;` de cierre. */
const funcion = (nombre: string, creacion = 'create function') => {
  const m = sql.match(new RegExp(`${creacion} public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

/** El SQL sin las líneas de comentario (la bajada comentada no cuenta). */
const sinComentarios = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migración placas-en-lote · tablas y columnas', () => {
  it('la tanda gana tipo (marcas por defecto: lo existente sigue siendo lo que era)', () => {
    expect(sql).toMatch(/alter table public\.tandas_promocion\s+add column tipo text not null default 'marcas' check \(tipo in \('marcas', 'motos', 'textos'\)\)/)
  })

  it('promociones gana grupo (1..10) y variante (1..5), solo dentro de una tanda y nunca los dos', () => {
    expect(sql).toMatch(/add column grupo\s+smallint check \(grupo between 1 and 10\)/)
    expect(sql).toMatch(/add column variante smallint check \(variante between 1 and 5\)/)
    expect(sql).toMatch(/promociones_grupo_variante_con_tanda check \(\(grupo is null and variante is null\) or tanda_id is not null\)/)
    expect(sql).toMatch(/promociones_grupo_xor_variante check \(grupo is null or variante is null\)/)
  })

  it('la unicidad pasa de (tanda, marca) a (tanda, grupo, variante, marca) para las no descartadas', () => {
    expect(sql).toContain('drop index public.promociones_tanda_marca_unica')
    expect(sql).toMatch(
      /create unique index promociones_tanda_pieza_unica\s+on public\.promociones \(tanda_id, coalesce\(grupo, 0\), coalesce\(variante, 0\), marca_id\)\s+where tanda_id is not null and estado <> 'descartada'/,
    )
  })

  it('lotes_generacion: estimado o confirmado, de 1 a 10 ítems, de una tanda o de una promoción', () => {
    expect(sql).toMatch(/create table public\.lotes_generacion \(/)
    expect(sql).toMatch(/organizacion_id\s+uuid not null references public\.organizaciones\(id\) on delete cascade/)
    expect(sql).toMatch(/estado\s+text not null default 'estimado' check \(estado in \('estimado', 'confirmado'\)\)/)
    expect(sql).toMatch(/items\s+integer not null check \(items between 1 and 10\)/)
    expect(sql).toMatch(/costo_estimado_usd numeric\(10,6\) not null check \(costo_estimado_usd >= 0\)/)
    expect(sql).toMatch(/check \(tanda_id is null or promocion_id is null\)/)
  })

  it('RLS: solo lectura por pertenencia y ninguna política de escritura (regla #5)', () => {
    expect(sql).toContain('alter table public.lotes_generacion enable row level security')
    expect(sql).toMatch(/create policy "lectura por pertenencia" on public\.lotes_generacion\s+for select using \(public\.es_miembro\(organizacion_id\)\)/)
    expect(sinComentarios).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('generaciones gana grupo y lote_id (restrict: un lote con imágenes no se borra)', () => {
    expect(sql).toMatch(/alter table public\.generaciones\s+add column grupo\s+smallint check \(grupo between 1 and 10\)/)
    expect(sql).toMatch(/add column lote_id uuid references public\.lotes_generacion\(id\) on delete restrict/)
    expect(sql).toMatch(/generaciones_grupo_con_destino check \(grupo is null or tanda_id is not null or promocion_id is not null\)/)
    expect(sql).toMatch(/create index on public\.generaciones \(lote_id\) where lote_id is not null/)
  })

  it('no guarda tokens ni claves (regla #4) y no borra datos', () => {
    expect(sinComentarios).not.toMatch(/\b(token_ref|api_key|secret|password)\b/i)
    expect(sinComentarios).not.toMatch(/\bdrop\s+(table|function|column|constraint)/i)
  })

  it('trae la bajada comentada', () => {
    expect(sql).toMatch(/-- BAJADA/)
    expect(sql).toMatch(/-- create unique index promociones_tanda_marca_unica/)
  })
})

describe('todas las funciones: search_path vacío, solo service_role', () => {
  const nuevas: [string, string][] = [
    ['crear_lote_promocion', 'uuid, text, text[], jsonb, text, uuid'],
    ['crear_lote_generacion', 'uuid, uuid, uuid, jsonb, timestamptz, uuid'],
    ['confirmar_lote_generacion', 'uuid, numeric, uuid'],
    ['iniciar_generacion_lote', 'uuid, uuid'],
    ['liberar_generaciones_lote', 'uuid, uuid'],
  ]
  for (const [nombre, firma] of nuevas) {
    it(`${nombre}: plpgsql, search_path vacío, revoke de public/anon/authenticated y grant a service_role`, () => {
      const f = funcion(nombre)
      expect(f).toMatch(/language plpgsql/)
      expect(f).toMatch(/set search_path = ''/)
      expect(sql).toContain(`revoke all on function public.${nombre}(${firma}) from public, anon, authenticated;`)
      expect(sql).toContain(`grant execute on function public.${nombre}(${firma}) to service_role;`)
    })
  }
})

describe('crear_lote_promocion', () => {
  const f = () => funcion('crear_lote_promocion')

  it('defiende las cardinalidades (22023): motos 2..10 × marcas 1..7 y hasta 14 placas; textos 1 marca y 2..5', () => {
    expect(f()).toMatch(/p_tipo not in \('motos', 'textos'\)/)
    expect(f()).toMatch(/v_nm < 1 or v_nm > 7/)
    expect(f()).toMatch(/count\(distinct m\) from unnest\(p_marcas\)/)
    expect(f()).toMatch(/p_tipo = 'motos' and \(v_ni < 2 or v_ni > 10 or v_ni \* v_nm > 14\)/)
    expect(f()).toMatch(/p_tipo = 'textos' and \(v_nm <> 1 or v_ni < 2 or v_ni > 5\)/)
    expect(f()).toMatch(/errcode = '22023'/)
  })

  it('en textos todas las variantes son de la misma foto y del mismo modelo', () => {
    expect(f()).toMatch(/count\(distinct \(i->>'fotoId', i->>'modelo'\)\)/)
  })

  it('bloquea las fotos (de la org, de moto, vivas) ANTES de insertar y falta alguna: PT404', () => {
    const g = f()
    expect(g).toMatch(/from public\.fotos[\s\S]*organizacion_id = p_org and uso = 'moto' and borrada_en is null and ruta is not null[\s\S]*for update/)
    expect(g).toMatch(/errcode = 'PT404'/)
    expect(g.indexOf('for update')).toBeLessThan(g.indexOf('insert into public.tandas_promocion'))
  })

  it('motos: una hija por (moto, marca) con grupo = posición; textos: una hija por texto con variante, titular y línea extra', () => {
    const g = f()
    expect(g).toMatch(/insert into public\.tandas_promocion \(organizacion_id, creado_por, tipo\)/)
    expect(g).toMatch(/insert into public\.promociones \(organizacion_id, tanda_id, grupo, marca_id/)
    expect(g).toMatch(/cross join unnest\(p_marcas\) with ordinality/)
    expect(g).toMatch(/insert into public\.promociones \(organizacion_id, tanda_id, variante, marca_id[^)]*titular, linea_extra/)
  })

  it('devuelve las hijas en un orden estable (grupo, variante, orden de las marcas)', () => {
    expect(f()).toMatch(/order by coalesce\(p\.grupo, 0\), coalesce\(p\.variante, 0\), array_position\(p_marcas, p\.marca_id\)/)
  })
})

describe('crear_lote_generacion', () => {
  const f = () => funcion('crear_lote_generacion')

  it('es de una tanda O de una promoción, y de 1 a 10 imágenes (22023)', () => {
    expect(f()).toMatch(/\(p_tanda is null\) = \(p_promocion is null\)/)
    expect(f()).toMatch(/v_ni < 1 or v_ni > 10/)
    expect(f()).toMatch(/errcode = '22023'/)
  })

  it('el destino tiene que ser de la organización (PT404)', () => {
    expect(f()).toMatch(/from public\.tandas_promocion where id = p_tanda and organizacion_id = p_org/)
    expect(f()).toMatch(/from public\.promociones where id = p_promocion and organizacion_id = p_org/)
    expect(f()).toMatch(/errcode = 'PT404'/)
  })

  it('crea el lote con el total de los ítems y las generaciones quedan estimadas (no cuestan): nace sin estado explícito', () => {
    const g = f()
    expect(g).toMatch(/insert into public\.lotes_generacion/)
    expect(g).toMatch(/sum\(\(i->>'costoEstimadoUsd'\)::numeric\)/)
    expect(g).toMatch(/insert into public\.generaciones \(/)
    expect(g).toMatch(/lote_id/)
    expect(g).toMatch(/'promocion'/)
    expect(g).not.toMatch(/confirmada/)
  })
})

describe('confirmar_lote_generacion · la compuerta de lote', () => {
  const f = () => funcion('confirmar_lote_generacion')

  it('tope inválido 22023; lote inexistente PT404; ya confirmado PT409; vencido PT410; supera el tope PT402', () => {
    const g = f()
    expect(g).toMatch(/p_tope is null or p_tope <= 0[\s\S]*errcode = '22023'/)
    expect(g).toMatch(/El lote no existe' using errcode = 'PT404'/)
    expect(g).toMatch(/v\.estado <> 'estimado'[\s\S]*errcode = 'PT409'/)
    expect(g).toMatch(/v\.vence_en < now\(\)[\s\S]*errcode = 'PT410'/)
    expect(g).toMatch(/v_gastado \+ v_total > p_tope[\s\S]*errcode = 'PT402'/)
  })

  it('bloquea primero la organización y después el lote y sus generaciones', () => {
    const g = f()
    const org = g.indexOf('from public.organizaciones where id = v.organizacion_id for update')
    const lote = g.indexOf('from public.lotes_generacion where id = p_lote for update')
    const gens = g.indexOf('from public.generaciones where lote_id = p_lote for update')
    expect(org).toBeGreaterThan(-1)
    expect(lote).toBeGreaterThan(org)
    expect(gens).toBeGreaterThan(lote)
  })

  it('recalcula el total de las filas y exige que TODAS sigan estimadas (PT409)', () => {
    const g = f()
    expect(g).toMatch(/select count\(\*\), coalesce\(sum\(costo_estimado_usd\), 0\) into v_n, v_total\s+from public\.generaciones where lote_id = p_lote and estado = 'estimada'/)
    expect(g).toMatch(/v_n <> v\.items[\s\S]*errcode = 'PT409'/)
  })

  it('el chequeo del tope va ANTES de confirmar nada: todas o ninguna', () => {
    const g = f()
    expect(g.indexOf("errcode = 'PT402'")).toBeLessThan(g.indexOf("set estado = 'confirmada'"))
    expect(g).toMatch(/gasto_generaciones_mes\(v\.organizacion_id\)/)
  })

  it('confirma todas las generaciones del lote y marca el lote confirmado, con quién y cuándo', () => {
    const g = f()
    expect(g).toMatch(/update public\.generaciones\s+set estado = 'confirmada', confirmada_por = p_usuario, confirmada_en = now\(\)\s+where lote_id = p_lote/)
    expect(g).toMatch(/update public\.lotes_generacion\s+set estado = 'confirmado', confirmado_por = p_usuario, confirmado_en = now\(\)/)
  })
})

describe('iniciar_generacion_lote', () => {
  const f = () => funcion('iniciar_generacion_lote')
  it('bloquea la fila; no existe PT404; sin lote o no confirmada PT409 (no corre dos veces); pasa a corriendo', () => {
    expect(f()).toMatch(/from public\.generaciones where id = p_id for update/)
    expect(f()).toMatch(/errcode = 'PT404'/)
    expect(f()).toMatch(/v\.lote_id is null or v\.estado <> 'confirmada'[\s\S]*errcode = 'PT409'/)
    expect(f()).toMatch(/set estado = 'corriendo'/)
  })
})

describe('liberar_generaciones_lote', () => {
  const f = () => funcion('liberar_generaciones_lote')
  it('las confirmadas sin correr quedan en error con costo real 0 (dejan de contar en el tope) y devuelve cuántas', () => {
    expect(f()).toMatch(/set estado = 'error', costo_real_usd = 0, error = 'Liberada sin generar', terminada_en = now\(\)/)
    expect(f()).toMatch(/where lote_id = p_lote and estado = 'confirmada'/)
    expect(f()).toMatch(/get diagnostics v_n = row_count/)
    expect(f()).toMatch(/errcode = 'PT404'/)
  })
})

describe('confirmar_generacion (reemplazo)', () => {
  const f = () => funcion('confirmar_generacion', 'create or replace function')
  it('misma firma y retorno: es create or replace, no drop', () => {
    expect(f()).toMatch(/confirmar_generacion\(p_id uuid, p_tope numeric, p_usuario uuid\)\s+returns public\.generaciones/)
    expect(sinComentarios).not.toMatch(/drop function/i)
  })
  it('rechaza un ítem de lote (PT409) antes de mirar el estado', () => {
    const g = f()
    expect(g).toMatch(/v\.lote_id is not null[\s\S]*errcode = 'PT409'/)
    expect(g.indexOf('v.lote_id is not null')).toBeLessThan(g.indexOf("v.estado <> 'estimada'"))
  })
  it('conserva la compuerta de siempre: lock de la organización, PT410, PT402', () => {
    const g = f()
    expect(g).toMatch(/from public\.organizaciones where id = v\.organizacion_id for update/)
    expect(g).toMatch(/errcode = 'PT410'/)
    expect(g).toMatch(/errcode = 'PT402'/)
  })
})
