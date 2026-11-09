import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const archivo = '20261110120000_plantillas_diseno.sql'
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', archivo), 'utf8')

const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create or replace function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}
const sinComentarios = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migración plantillas-diseno · columnas y checks', () => {
  it('el timestamp es posterior a la última migración (20261106120000)', () => {
    expect(Number(archivo.slice(0, 14))).toBeGreaterThan(20261106120000)
  })

  it('promociones gana diseno jsonb (objeto, ≤ 2 KB, null = defaults)', () => {
    expect(sql).toMatch(/add column diseno jsonb check \(diseno is null or \(jsonb_typeof\(diseno\) = 'object' and pg_column_size\(diseno\) <= 2048\)\)/)
  })

  it("promociones gana inspiracion_modo ('ambiente' por defecto | 'diseno'), not null", () => {
    expect(sql).toMatch(/add column inspiracion_modo text not null default 'ambiente' check \(inspiracion_modo in \('ambiente', 'diseno'\)\)/)
  })

  it('las plantillas de diseño llevan la moto al centro (la base lo defiende, no solo la app)', () => {
    expect(sql).toMatch(/add constraint promociones_diseno_moto_al_centro check \(plantilla is null or plantilla not in \('impactante_textura', 'deportiva', 'editorial'\) or posicion_moto = 'centro'\)/)
  })

  it('es aditiva: no borra ni crea tablas, solo reemplaza las dos funciones', () => {
    expect(sinComentarios).not.toMatch(/\bdrop\s+(table|column|index|constraint)/i)
    expect(sinComentarios).not.toMatch(/\bdrop\s+function/i)
    expect(sinComentarios).not.toMatch(/create (table|type)/i)
  })

  it('no guarda tokens ni claves (regla #4)', () => {
    expect(sinComentarios).not.toMatch(/\b(token_ref|api_key|secret|password)\b/i)
  })

  it('trae la bajada comentada', () => {
    expect(sql).toMatch(/-- BAJADA/)
  })
})

describe('editar_promocion (create or replace, misma firma)', () => {
  const f = () => funcion('editar_promocion')

  it('mantiene la firma y el modelo de seguridad', () => {
    expect(f()).toMatch(/editar_promocion\(p_id uuid, p_revision integer, p_campos jsonb, p_usuario uuid\)\s+returns public\.promociones/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/from public\.promociones where id = p_id for update/)
    for (const e of ['PT404', 'PT409', '22023']) expect(f()).toContain(`errcode = '${e}'`)
  })

  it('la lista blanca conserva todo lo anterior y suma diseno e inspiracion_modo', () => {
    for (const campo of ['marca_id', 'modelo', 'datos', 'foto_id', 'aspecto', 'plantilla', 'fondo', 'analisis_id', 'textos_id', 'copy', 'copy_opcion', 'copy_editado', 'titular', 'escena_creativo_id', 'placa_ruta', 'placa_hash', 'fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id']) {
      expect(f()).toContain(`'${campo}'`)
    }
    expect(f()).toMatch(/diseno\s+= case when p_campos \? 'diseno' then nullif\(p_campos->'diseno', 'null'::jsonb\) else diseno end/)
    expect(f()).toMatch(/inspiracion_modo\s+= case when p_campos \? 'inspiracion_modo' then p_campos->>'inspiracion_modo' else inspiracion_modo end/)
  })

  it('cambiar el diseño invalida la placa pero NO la escena', () => {
    const placa = f().match(/v_cambia_placa := [\s\S]*?;\n/)![0]
    expect(placa).toContain("p_campos ? 'diseno'")
    const escena = f().match(/v_cambia_escena := [\s\S]*?;\n/)![0]
    expect(escena).not.toContain('diseno')
  })

  it('el modo de la foto de inspiración no invalida ni la escena ni la placa (solo cambia la PRÓXIMA escena)', () => {
    expect(f().match(/v_cambia_placa := [\s\S]*?;\n/)![0]).not.toContain('inspiracion_modo')
    expect(f().match(/v_cambia_escena := [\s\S]*?;\n/)![0]).not.toContain('inspiracion_modo')
  })

  it('sigue invalidando escena y placa al cambiar foto o formato', () => {
    expect(f()).toMatch(/v_cambia_escena := not \(p_campos \? 'escena_creativo_id'\)/)
    expect(f()).toMatch(/escena_creativo_id = case/)
  })

  it('se reemite el revoke y el grant (solo service_role)', () => {
    expect(sql).toMatch(/revoke all on function public\.editar_promocion\(uuid, integer, jsonb, uuid\) from public, anon, authenticated;/)
    expect(sql).toMatch(/grant execute on function public\.editar_promocion\(uuid, integer, jsonb, uuid\) to service_role;/)
  })
})

describe('aprobar_promocion (create or replace, misma firma)', () => {
  const f = () => funcion('aprobar_promocion')

  it('mantiene la firma, el bloqueo y las validaciones', () => {
    expect(f()).toMatch(/aprobar_promocion\(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid\)\s+returns public\.aprobaciones_promocion/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/from public\.promociones where id = p_id for update/)
    expect(f()).toMatch(/copy is null/)
    expect(f()).toMatch(/escena_creativo_id is null/)
  })

  it('el snapshot inmutable suma diseno e inspiracion_modo, desde la fila bloqueada', () => {
    for (const campo of ['marca_id', 'modelo', 'datos', 'aspecto', 'plantilla', 'fondo', 'titular', 'copy', 'escena_creativo_id', 'fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id']) {
      expect(f()).toContain(`'${campo}'`)
    }
    expect(f()).toContain("'diseno', v_promo.diseno")
    expect(f()).toContain("'inspiracion_modo', v_promo.inspiracion_modo")
  })

  it('se reemite el revoke y el grant (solo service_role)', () => {
    expect(sql).toMatch(/revoke all on function public\.aprobar_promocion\(uuid, integer, text, text, uuid\) from public, anon, authenticated;/)
    expect(sql).toMatch(/grant execute on function public\.aprobar_promocion\(uuid, integer, text, text, uuid\) to service_role;/)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
})
