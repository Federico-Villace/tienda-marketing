import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261030120000_multi_marca.sql'), 'utf8')

/** Cuerpo de una función: desde su create hasta el `$$;` de cierre. */
const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

/** El SQL sin las líneas de comentario (la bajada comentada no cuenta). */
const sinComentarios = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migración multi-marca · tablas', () => {
  it('crea tandas_promocion con organización, autor y fecha', () => {
    expect(sql).toMatch(/create table public\.tandas_promocion \(/)
    expect(sql).toMatch(/organizacion_id\s+uuid not null references public\.organizaciones\(id\) on delete cascade/)
    expect(sql).toMatch(/creado_por\s+uuid references auth\.users\(id\) on delete set null/)
    expect(sql).toMatch(/create index on public\.tandas_promocion \(organizacion_id, creado_en desc\)/)
  })

  it('RLS: solo lectura por pertenencia y ninguna política de escritura (regla #5)', () => {
    expect(sql).toContain('alter table public.tandas_promocion enable row level security')
    expect(sql).toMatch(/create policy "lectura por pertenencia" on public\.tandas_promocion\s+for select using \(public\.es_miembro\(organizacion_id\)\)/)
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('promociones gana tanda_id (set null) y una marca no se repite en la misma tanda mientras no esté descartada', () => {
    expect(sql).toMatch(/alter table public\.promociones add column tanda_id uuid references public\.tandas_promocion\(id\) on delete set null/)
    expect(sql).toMatch(/create index on public\.promociones \(tanda_id\) where tanda_id is not null/)
    expect(sql).toMatch(
      /create unique index promociones_tanda_marca_unica on public\.promociones \(tanda_id, marca_id\)\s+where tanda_id is not null and estado <> 'descartada'/,
    )
  })

  it('generaciones gana tanda_id: solo con foto, y excluyente con promocion_id', () => {
    expect(sql).toMatch(/alter table public\.generaciones\s+add column tanda_id uuid references public\.tandas_promocion\(id\) on delete set null/)
    expect(sql).toMatch(/add constraint generaciones_tanda_con_foto check \(tanda_id is null or foto_id is not null\)/)
    expect(sql).toMatch(/add constraint generaciones_promocion_xor_tanda check \(promocion_id is null or tanda_id is null\)/)
    expect(sql).toMatch(/create index on public\.generaciones \(tanda_id, creado_en desc\) where tanda_id is not null/)
  })

  it('es aditiva: no borra ni cambia nada existente', () => {
    expect(sinComentarios).not.toMatch(/\bdrop\s+(table|function|column|index|constraint)/i)
    expect(sinComentarios).not.toMatch(/create or replace function/i)
  })

  it('no guarda tokens ni claves (regla #4)', () => {
    expect(sinComentarios).not.toMatch(/\b(token_ref|api_key|secret|password)\b/i)
  })
})

describe('crear_tanda_promocion', () => {
  const f = () => funcion('crear_tanda_promocion')

  it('es plpgsql con search_path vacío', () => {
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/set search_path = ''/)
  })

  it('exige entre 2 y 7 marcas distintas (22023)', () => {
    expect(f()).toMatch(/v_n < 2 or v_n > 7/)
    expect(f()).toMatch(/count\(distinct m\) from unnest\(p_marcas\)/)
    expect(f()).toMatch(/errcode = '22023'/)
  })

  it('bloquea la foto y la exige existente, de la organización y no borrada (PT404)', () => {
    expect(f()).toMatch(/from public\.fotos where id = p_foto and organizacion_id = p_org and borrada_en is null and ruta is not null for update/)
    expect(f()).toMatch(/errcode = 'PT404'/)
  })

  it('crea la tanda y las N hijas en la misma transacción, en el orden pedido', () => {
    expect(f()).toMatch(/insert into public\.tandas_promocion/)
    expect(f()).toMatch(/insert into public\.promociones \(organizacion_id, tanda_id, marca_id, modelo, datos, foto_id, aspecto, creado_por, actualizado_por\)/)
    expect(f()).toMatch(/with ordinality/)
    expect(f()).toMatch(/order by i/)
  })

  it('devuelve la tanda y las hijas', () => {
    expect(f()).toMatch(/'tandaId', v_tanda/)
    expect(f()).toMatch(/'promociones'/)
  })
})

describe('resumen_promocion_comparado', () => {
  const f = () => funcion('resumen_promocion_comparado')

  it('es un envoltorio stable con search_path vacío', () => {
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/\bstable\b/)
    expect(f()).toMatch(/set search_path = ''/)
  })

  it('valida 1..7 grupos y 1..3 modelos (22023)', () => {
    expect(f()).toMatch(/jsonb_array_length\(p_grupos\) not between 1 and 7/)
    expect(f()).toMatch(/array_length\(p_modelos, 1\), 0\) not between 1 and 3/)
    expect(f()).toMatch(/errcode = '22023'/)
  })

  it('reusa public.resumen_promocion tal cual, por grupo y modelo (regla #2: suma Postgres)', () => {
    expect(f()).toMatch(/public\.resumen_promocion\(\s*p_org,/)
    expect(f()).toMatch(/g->'cuentas'/)
    expect(f()).toMatch(/g->>'token'/)
    expect(f()).toMatch(/cross join unnest\(p_modelos\)/)
  })

  it('devuelve clave, modelo y resumen en orden estable', () => {
    expect(f()).toMatch(/'clave',\s*g->>'clave',\s*'modelo',\s*mo/)
    expect(f()).toMatch(/order by gi, mi/)
  })
})

describe('permisos', () => {
  const rpcs = [
    ['crear_tanda_promocion', 'uuid, text\\[\\], text, jsonb, uuid, text, uuid'],
    ['resumen_promocion_comparado', 'uuid, jsonb, text\\[\\], date, date'],
  ] as const

  for (const [nombre, firma] of rpcs) {
    it(`${nombre}: revoke a todos y grant solo a service_role`, () => {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nombre}\\(${firma}\\) from public, anon, authenticated;`))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${nombre}\\(${firma}\\) to service_role;`))
    })
  }

  it('ninguna función se concede a anon, authenticated ni public', () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('trae la BAJADA comentada', () => {
    expect(sql).toMatch(/-- BAJADA/)
    expect(sql).toMatch(/-- drop function public\.crear_tanda_promocion/)
    expect(sql).toMatch(/-- drop table public\.tandas_promocion/)
  })
})
