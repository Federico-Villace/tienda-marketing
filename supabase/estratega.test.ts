import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261022120000_estratega.sql'), 'utf8')

/** Cuerpo de una función: desde su create hasta el `$$;` de cierre. */
const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración del Estratega · tabla planes', () => {
  it('crea los enums de estado y origen', () => {
    expect(sql).toMatch(/create type estado_plan as enum \('borrador', 'aprobado', 'descartado', 'reemplazado'\)/)
    expect(sql).toMatch(/create type origen_plan as enum \('agente', 'edicion'\)/)
  })

  it('versiones inmutables: unique(raiz_id, version) y un solo aprobado por raíz (índice parcial)', () => {
    expect(sql).toMatch(/unique \(raiz_id, version\)/)
    expect(sql).toMatch(/create unique index planes_un_aprobado on planes \(raiz_id\) where estado = 'aprobado'/)
  })

  it('caché: hash único por organización solo para los planes del agente', () => {
    expect(sql).toMatch(/create unique index planes_hash_agente on planes \(organizacion_id, hash_entrada\) where origen = 'agente'/)
  })

  it('el trigger completa raiz_id con el id antes de insertar', () => {
    expect(sql).toMatch(/new\.raiz_id := coalesce\(new\.raiz_id, new\.id\)/)
    expect(sql).toMatch(/before insert on planes/)
  })

  it('RLS: solo lectura por pertenencia, ninguna política de escritura', () => {
    expect(sql).toMatch(/alter table planes enable row level security/)
    expect(sql).toMatch(/create policy "lectura por pertenencia" on planes\s+for select using \(es_miembro\(organizacion_id\)\)/)
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda tokens ni claves en columnas (regla #4)', () => {
    expect(sql).not.toMatch(/\b(token_ref|api_key|secret|password|clave)\b/i)
  })

  it('el check de aprobación no rompe al reemplazar un aprobado (conserva su aprobado_en)', () => {
    expect(sql).toMatch(/check \(estado <> 'aprobado' or aprobado_en is not null\)/)
  })
})

describe('migración del Estratega · RPCs transaccionales', () => {
  const rpcs = [
    ['editar_plan', 'uuid, integer, jsonb, uuid'],
    ['aprobar_plan', 'uuid, integer, uuid'],
    ['descartar_plan', 'uuid, integer'],
  ] as const

  for (const [nombre, firma] of rpcs) {
    describe(nombre, () => {
      it('plpgsql con search_path vacío y bloqueo for update', () => {
        const f = funcion(nombre)
        expect(f).toMatch(/language plpgsql/)
        expect(f).toMatch(/set search_path = ''/)
        expect(f).toMatch(/for update/)
      })

      it('responde PT409 cuando la versión no es la vigente', () => {
        expect(funcion(nombre)).toMatch(/errcode = 'PT409'/)
      })

      it('revoca a todos y concede solo a service_role', () => {
        expect(sql).toContain(`revoke all on function public.${nombre}(${firma}) from public, anon, authenticated;`)
        expect(sql).toContain(`grant execute on function public.${nombre}(${firma}) to service_role;`)
      })
    })
  }

  it('nunca concede a anon, authenticated ni public', () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  it('aprobar reemplaza el aprobado previo ANTES de aprobar el nuevo (índice parcial)', () => {
    const f = funcion('aprobar_plan')
    expect(f.indexOf("estado = 'reemplazado'")).toBeGreaterThan(-1)
    expect(f.indexOf("estado = 'reemplazado'")).toBeLessThan(f.indexOf("estado = 'aprobado'"))
  })

  it('editar inserta la versión siguiente con origen edicion y costo 0, sin tocar al aprobado', () => {
    const f = funcion('editar_plan')
    expect(f).toMatch(/'edicion'/)
    expect(f).toMatch(/v_punta \+ 1/)
    expect(f).toMatch(/jsonb_typeof\(p_plan\) is distinct from 'object'/)
    // Solo una punta en borrador pasa a reemplazado.
    expect(f).toMatch(/if v_fila\.estado = 'borrador' then/)
  })
})
