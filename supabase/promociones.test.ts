import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261029120000_promociones.sql'), 'utf8')

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

describe('migración de promociones · tablas', () => {
  it('crea el enum de estado de la promoción', () => {
    expect(sql).toMatch(/create type public\.estado_promocion as enum \('borrador', 'aprobada', 'descartada'\)/)
  })

  it('crea las tres tablas', () => {
    for (const t of ['promociones', 'textos_promocion', 'aprobaciones_promocion']) {
      expect(sql).toMatch(new RegExp(`create table public\\.${t} \\(`))
    }
  })

  it('promociones: borrador mutable con revisión optimista y foto que no se puede perder', () => {
    expect(sql).toMatch(/revision\s+integer not null default 1 check \(revision >= 1\)/)
    expect(sql).toMatch(/foto_id\s+uuid not null references public\.fotos\(id\) on delete restrict/)
    expect(sql).toMatch(/aspecto\s+text not null check \(aspecto in \('1:1', '4:5', '9:16'\)\)/)
    expect(sql).toMatch(/check \(\(placa_ruta is null\) = \(placa_hash is null\)\)/)
    expect(sql).toMatch(/check \(estado <> 'aprobada' or \(copy is not null and placa_ruta is not null\)\)/)
  })

  it('el paso actual NO es una columna: se deriva', () => {
    expect(sinComentarios).not.toMatch(/\bpaso\b/i)
  })

  it('textos_promocion: caché por hash, tres opciones exactas y costo registrado', () => {
    expect(sql).toMatch(/unique \(organizacion_id, hash_entrada\)/)
    expect(sql).toMatch(/jsonb_array_length\(opciones\) = 3/)
    expect(sql).toMatch(/costo_usd\s+numeric\(10,6\) not null default 0/)
    expect(sql).toMatch(/datos_hash\s+text not null/)
    expect(sql).toMatch(/add constraint textos_promocion_promocion_fk\s+foreign key \(promocion_id\) references public\.promociones\(id\) on delete cascade/)
  })

  it('aprobaciones_promocion: snapshot inmutable y versiones únicas por promoción', () => {
    expect(sql).toMatch(/snapshot\s+jsonb not null/)
    expect(sql).toMatch(/unique \(promocion_id, version\)/)
    expect(sql).toMatch(/aprobado_por\s+uuid not null references auth\.users\(id\) on delete restrict/)
  })

  it('generaciones gana promocion_id y solo con foto de origen', () => {
    expect(sql).toMatch(/alter table public\.generaciones\s+add column promocion_id uuid references public\.promociones\(id\) on delete set null/)
    expect(sql).toMatch(/add constraint generaciones_promocion_con_foto check \(promocion_id is null or foto_id is not null\)/)
  })

  it('RLS: solo lectura por pertenencia en las tres tablas, ninguna política de escritura (regla #5)', () => {
    for (const t of ['promociones', 'textos_promocion', 'aprobaciones_promocion']) {
      expect(sql).toContain(`alter table public.${t} enable row level security`)
      expect(sql).toMatch(new RegExp(`create policy "lectura por pertenencia" on public\\.${t}\\s+for select using \\(public\\.es_miembro\\(organizacion_id\\)\\)`))
    }
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i)
  })

  it('no guarda tokens ni claves (regla #4)', () => {
    expect(sinComentarios).not.toMatch(/\b(token_ref|api_key|secret|password|clave|body)\b/i)
  })
})

describe('migración de promociones · RPCs transaccionales', () => {
  const rpcs = [
    ['editar_promocion', 'uuid, integer, jsonb, uuid'],
    ['aprobar_promocion', 'uuid, integer, text, text, uuid'],
    ['reabrir_promocion', 'uuid, integer, uuid'],
    ['descartar_promocion', 'uuid, integer, uuid'],
    ['resumen_promocion', 'uuid, text\\[\\], text, text, date, date'],
  ] as const

  for (const [nombre, firma] of rpcs) {
    it(`${nombre}: search_path vacío, revoke a todos y grant solo a service_role`, () => {
      expect(funcion(nombre)).toMatch(/set search_path = ''/)
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nombre}\\(${firma}\\) from public, anon, authenticated;`))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${nombre}\\(${firma}\\) to service_role;`))
    })
  }

  it('ninguna función se concede a anon, authenticated ni public', () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })

  for (const nombre of ['editar_promocion', 'aprobar_promocion', 'reabrir_promocion', 'descartar_promocion']) {
    it(`${nombre}: bloquea la fila (for update) y distingue PT404 / PT409`, () => {
      const f = funcion(nombre)
      expect(f).toMatch(/language plpgsql/)
      expect(f).toMatch(/from public\.promociones where id = p_id for update/)
      expect(f).toMatch(/errcode = 'PT404'/)
      expect(f).toMatch(/errcode = 'PT409'/)
      expect(f).toMatch(/revision <> p_revision/)
    })
  }

  it('editar_promocion: solo toca los campos de una lista blanca y rechaza el resto (22023)', () => {
    const f = funcion('editar_promocion')
    for (const campo of ['marca_id', 'modelo', 'datos', 'foto_id', 'aspecto', 'plantilla', 'fondo', 'analisis_id', 'textos_id', 'copy', 'copy_opcion', 'copy_editado', 'titular', 'escena_creativo_id', 'placa_ruta', 'placa_hash']) {
      expect(f).toContain(`'${campo}'`)
    }
    expect(f).toMatch(/jsonb_object_keys\(p_campos\)/)
    expect(f).toMatch(/errcode = '22023'/)
    expect(f).toMatch(/case when p_campos \? 'modelo' then/)
  })

  it('editar_promocion: solo edita borradores', () => {
    expect(funcion('editar_promocion')).toMatch(/estado <> 'borrador'/)
  })

  it('editar_promocion: cambiar foto o formato borra la escena y la placa; cambiar lo que la afecta borra la placa', () => {
    const f = funcion('editar_promocion')
    expect(f).toMatch(/escena_creativo_id\s+= case/)
    expect(f).toMatch(/placa_ruta\s+= case/)
    expect(f).toMatch(/placa_hash\s+= case/)
    expect(f).toMatch(/revision\s+= revision \+ 1/)
  })

  it('aprobar_promocion: exige copy y escena (PT422) y arma el snapshot EN SQL desde la fila', () => {
    const f = funcion('aprobar_promocion')
    expect(f).toMatch(/errcode = 'PT422'/)
    expect(f).toMatch(/copy is null/)
    expect(f).toMatch(/escena_creativo_id is null/)
    expect(f).toMatch(/jsonb_build_object\(/)
    for (const campo of ['marca_id', 'modelo', 'datos', 'aspecto', 'plantilla', 'fondo', 'titular', 'copy', 'copy_editado', 'analisis_id', 'textos_id', 'escena_creativo_id']) {
      expect(f).toContain(`'${campo}'`)
    }
    expect(f).toMatch(/coalesce\(max\(version\), 0\) \+ 1/)
    expect(f).toMatch(/estado = 'aprobada'/)
  })

  it('reabrir_promocion: solo una aprobada vuelve a borrador', () => {
    const f = funcion('reabrir_promocion')
    expect(f).toMatch(/estado <> 'aprobada'/)
    expect(f).toMatch(/estado = 'borrador'/)
  })

  it('descartar_promocion: solo un borrador se descarta y no borra nada', () => {
    const f = funcion('descartar_promocion')
    expect(f).toMatch(/estado = 'descartada'/)
    expect(f).not.toMatch(/\bdelete\b/i)
  })
})

describe('migración de promociones · resumen_promocion (regla #2: Postgres suma, el LLM no ve filas)', () => {
  const f = () => funcion('resumen_promocion')

  it('es una función SQL stable que devuelve jsonb', () => {
    expect(f()).toMatch(/returns jsonb/)
    expect(f()).toMatch(/language sql/)
    expect(f()).toMatch(/\bstable\b/)
  })

  it('la mención del modelo normaliza con regexp_replace y busca con strpos: nunca ilike con concatenación', () => {
    expect(f()).toMatch(/regexp_replace\(/)
    expect(f()).toContain("'[^a-z0-9]'")
    expect(f()).toMatch(/strpos\(/)
    expect(sinComentarios).not.toMatch(/\bilike\b/i)
    expect(sinComentarios).not.toMatch(/'%'\s*\|\|/)
  })

  it('un modelo de menos de 3 caracteres no se filtra y lo informa', () => {
    expect(f()).toMatch(/char_length\([^)]*\) >= 3/)
    expect(f()).toContain('modeloFiltrable')
  })

  it('las cuentas son las de la marca y las campañas se atribuyen por NOMBRE', () => {
    expect(f()).toMatch(/cm\.meta_id = any\(p_cuentas\)/)
    expect(f()).toMatch(/c\.nombre/)
  })

  it('agrega por modelo, por tipo de promo, mejores y campañas; los textos se recortan a 140', () => {
    for (const k of ['organico', 'porPromo', 'mejores', 'campanias']) expect(f()).toContain(`'${k}'`)
    expect(f()).toMatch(/left\(coalesce\(p\.texto, ''\), 140\)/)
  })

  it('no devuelve ids ni permalinks', () => {
    expect(f()).not.toMatch(/permalink/)
    expect(f()).not.toMatch(/'(publicacionId|campaniaId|id)'/)
  })
})

describe('migración de promociones · bajada', () => {
  it('trae la bajada comentada', () => {
    expect(sql).toMatch(/-- BAJADA/)
    expect(sql).toMatch(/-- drop table public\.aprobaciones_promocion/)
  })
})
