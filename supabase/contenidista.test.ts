import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261025120000_contenidista.sql'), 'utf8')

/** Cuerpo de una función: desde su create hasta el `$$;` de cierre. */
const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración del Contenidista · tablas', () => {
  it('crea los enums de estado y origen de pieza', () => {
    expect(sql).toMatch(/create type estado_pieza as enum \('borrador', 'aprobada', 'descartada', 'reemplazada'\)/)
    expect(sql).toMatch(/create type origen_pieza as enum \('agente', 'edicion'\)/)
  })

  it('tandas: hash único por organización y SIN unique(plan_id, semana): varias tandas por semana conviven', () => {
    expect(sql).toMatch(/create unique index tandas_contenido_hash on tandas_contenido \(organizacion_id, hash_entrada\)/)
    expect(sql).not.toMatch(/unique[^;]*\(plan_id, semana\)/i)
    expect(sql).toMatch(/plan_id\s+uuid not null references planes\(id\) on delete restrict/)
    expect(sql).toMatch(/semana\s+integer not null check \(semana between 1 and 13\)/)
  })

  it('piezas: versiones inmutables y una sola aprobada por raíz (índice parcial)', () => {
    expect(sql).toMatch(/unique \(raiz_id, version\)/)
    expect(sql).toMatch(/create unique index piezas_una_aprobada on piezas \(raiz_id\) where estado = 'aprobada'/)
    expect(sql).toMatch(/check \(\(origen = 'agente'\) = \(version = 1\)\)/)
    expect(sql).toMatch(/check \(estado <> 'aprobada' or aprobado_en is not null\)/)
  })

  it('el trigger completa raiz_id con el id antes de insertar', () => {
    expect(sql).toMatch(/new\.raiz_id := coalesce\(new\.raiz_id, new\.id\)/)
    expect(sql).toMatch(/before insert on piezas/)
  })

  it('S38 RLS: solo lectura por pertenencia en ambas tablas, ninguna política de escritura', () => {
    for (const t of ['tandas_contenido', 'piezas']) {
      expect(sql).toContain(`alter table ${t} enable row level security`)
      expect(sql).toMatch(new RegExp(`create policy "lectura por pertenencia" on ${t}\\s+for select using \\(es_miembro\\(organizacion_id\\)\\)`))
    }
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('S37 no guarda tokens, claves ni el body de OpenAI (regla #4)', () => {
    expect(sql).not.toMatch(/\b(token_ref|api_key|secret|password|clave|body)\b/i)
  })
})

describe('migración del Contenidista · RPCs transaccionales', () => {
  const rpcs = [
    ['guardar_tanda', 'jsonb, jsonb'],
    ['editar_pieza', 'uuid, integer, jsonb, uuid'],
    ['aprobar_pieza', 'uuid, integer, uuid'],
    ['descartar_pieza', 'uuid, integer'],
  ] as const

  for (const [nombre, firma] of rpcs) {
    describe(nombre, () => {
      it('plpgsql con search_path vacío', () => {
        const f = funcion(nombre)
        expect(f).toMatch(/language plpgsql/)
        expect(f).toMatch(/set search_path = ''/)
      })

      it('S38 revoca a todos y concede solo a service_role', () => {
        expect(sql).toContain(`revoke all on function public.${nombre}(${firma}) from public, anon, authenticated;`)
        expect(sql).toContain(`grant execute on function public.${nombre}(${firma}) to service_role;`)
      })

      it('usa PT409', () => {
        expect(funcion(nombre)).toMatch(/errcode = 'PT409'/)
      })
    })
  }

  it('nunca concede a anon, authenticated ni public', () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('las transiciones bloquean toda la raíz (for update)', () => {
    for (const n of ['editar_pieza', 'aprobar_pieza', 'descartar_pieza']) expect(funcion(n)).toMatch(/for update/)
  })

  it('guardar_tanda es atómica: valida el array (1 a 12), inserta tanda y luego las piezas v1 del agente en borrador', () => {
    const f = funcion('guardar_tanda')
    expect(f).toMatch(/jsonb_typeof\(p_piezas\) is distinct from 'array'/)
    expect(f).toMatch(/jsonb_array_length\(p_piezas\) not between 1 and 12/)
    expect(f).toMatch(/errcode = '22023'/)
    expect(f.indexOf('insert into public.tandas_contenido')).toBeLessThan(f.indexOf('insert into public.piezas'))
    expect(f).toMatch(/jsonb_array_elements\(p_piezas\) with ordinality/)
    expect(f).toMatch(/1, 'agente', 'borrador'/)
    expect(f).toMatch(/when unique_violation then/)
  })

  it('aprobar reemplaza la aprobada previa ANTES de aprobar la nueva (índice parcial)', () => {
    const f = funcion('aprobar_pieza')
    expect(f.indexOf("estado = 'reemplazada'")).toBeGreaterThan(-1)
    expect(f.indexOf("estado = 'reemplazada'")).toBeLessThan(f.indexOf("estado = 'aprobada'"))
  })

  it('editar inserta la versión siguiente con origen edicion, copia tanda/plan/semana/orden y no toca a la aprobada', () => {
    const f = funcion('editar_pieza')
    expect(f).toMatch(/'edicion'/)
    expect(f).toMatch(/v_punta \+ 1/)
    expect(f).toMatch(/jsonb_typeof\(p_pieza\) is distinct from 'object'/)
    expect(f).toMatch(/v_fila\.tanda_id, v_fila\.plan_id, v_fila\.semana, v_fila\.orden/)
    expect(f).toMatch(/if v_fila\.estado = 'borrador' then/)
  })

  it('descartar y aprobar solo sobre un borrador (aprobar una descartada es 409)', () => {
    for (const n of ['aprobar_pieza', 'descartar_pieza']) expect(funcion(n)).toMatch(/v_fila\.estado <> 'borrador'/)
  })
})
