import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261031120000_placa_personalizable.sql'), 'utf8')

/** Cuerpo de una función: desde su create or replace hasta el `$$;` de cierre. */
const funcion = (nombre: string) => {
  const m = sql.match(new RegExp(`create or replace function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

/** El SQL sin las líneas de comentario (la bajada comentada no cuenta). */
const sinComentarios = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migración placa-personalizable · columnas', () => {
  it('fotos gana "uso": moto por defecto o inspiración, y las que ya hay quedan como moto', () => {
    expect(sql).toMatch(/alter table public\.fotos\s+add column uso text not null default 'moto' check \(uso in \('moto', 'inspiracion'\)\)/)
  })

  it('promociones gana descripción del fondo (≤300), posición de la moto, línea extra (≤60) y foto de inspiración (set null)', () => {
    expect(sql).toMatch(/add column fondo_descripcion text check \(char_length\(fondo_descripcion\) <= 300\)/)
    expect(sql).toMatch(/add column posicion_moto text not null default 'centro' check \(posicion_moto in \('izquierda', 'centro', 'derecha'\)\)/)
    expect(sql).toMatch(/add column linea_extra text check \(char_length\(linea_extra\) <= 60\)/)
    expect(sql).toMatch(/add column inspiracion_foto_id uuid references public\.fotos\(id\) on delete set null/)
  })

  it('la base defiende que el texto al costado no tenga la moto al centro', () => {
    expect(sql).toMatch(/add constraint promociones_costado_sin_moto_al_centro check \(plantilla is null or right\(plantilla, 8\) <> '_costado' or posicion_moto <> 'centro'\)/)
  })

  it('generaciones guarda la foto de referencia (restrict, como foto_id) y solo junto a una foto de moto', () => {
    expect(sql).toMatch(/alter table public\.generaciones\s+add column referencia_foto_id uuid references public\.fotos\(id\) on delete restrict/)
    expect(sql).toMatch(/add constraint generaciones_referencia_con_foto check \(referencia_foto_id is null or foto_id is not null\)/)
  })

  it('es aditiva: no borra nada ni toca tablas, solo reemplaza las dos funciones', () => {
    expect(sinComentarios).not.toMatch(/\bdrop\s+(table|column|index|constraint)/i)
    expect(sinComentarios).not.toMatch(/\bdrop\s+function/i)
    expect(sinComentarios).not.toMatch(/create (table|type)/i)
  })

  it('no guarda tokens ni claves (regla #4)', () => {
    expect(sinComentarios).not.toMatch(/\b(token_ref|api_key|secret|password)\b/i)
  })
})

describe('editar_promocion (create or replace, misma firma)', () => {
  const f = () => funcion('editar_promocion')

  it('mantiene la firma y el modelo de seguridad', () => {
    expect(f()).toMatch(/editar_promocion\(p_id uuid, p_revision integer, p_campos jsonb, p_usuario uuid\)\s+returns public\.promociones/)
    expect(f()).toMatch(/language plpgsql/)
    expect(f()).toMatch(/set search_path = ''/)
    expect(f()).toMatch(/from public\.promociones where id = p_id for update/)
    expect(f()).toMatch(/errcode = 'PT404'/)
    expect(f()).toMatch(/errcode = 'PT409'/)
    expect(f()).toMatch(/errcode = '22023'/)
  })

  it('la lista blanca conserva todo lo anterior y suma los cuatro campos nuevos', () => {
    for (const campo of ['marca_id', 'modelo', 'datos', 'foto_id', 'aspecto', 'plantilla', 'fondo', 'analisis_id', 'textos_id', 'copy', 'copy_opcion', 'copy_editado', 'titular', 'escena_creativo_id', 'placa_ruta', 'placa_hash']) {
      expect(f()).toContain(`'${campo}'`)
    }
    for (const campo of ['fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id']) {
      expect(f()).toContain(`'${campo}'`)
      expect(f()).toMatch(new RegExp(`${campo}\\s+= case when p_campos \\? '${campo}' then`))
    }
  })

  it('la línea extra y la posición de la moto invalidan la placa; la descripción y la inspiración no (solo cambian la escena a generar)', () => {
    const v = f().match(/v_cambia_placa := [\s\S]*?;\n/)![0]
    expect(v).toContain("p_campos ? 'linea_extra'")
    expect(v).toContain("p_campos ? 'posicion_moto'")
    expect(v).not.toContain('fondo_descripcion')
    expect(v).not.toContain('inspiracion_foto_id')
  })

  it('sigue invalidando escena y placa al cambiar foto o formato', () => {
    expect(f()).toMatch(/v_cambia_escena := not \(p_campos \? 'escena_creativo_id'\)/)
    expect(f()).toMatch(/escena_creativo_id = case/)
  })

  it('se reemita el revoke y el grant (solo service_role)', () => {
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
    expect(f()).toMatch(/coalesce\(max\(version\), 0\) \+ 1/)
  })

  it('el snapshot inmutable suma lo nuevo, siempre desde la fila bloqueada', () => {
    for (const campo of ['marca_id', 'modelo', 'datos', 'aspecto', 'plantilla', 'fondo', 'titular', 'copy', 'copy_editado', 'analisis_id', 'textos_id', 'escena_creativo_id']) {
      expect(f()).toContain(`'${campo}'`)
    }
    for (const campo of ['fondo_descripcion', 'posicion_moto', 'linea_extra', 'inspiracion_foto_id']) {
      expect(f()).toContain(`'${campo}', v_promo.${campo}`)
    }
  })

  it('se reemita el revoke y el grant (solo service_role)', () => {
    expect(sql).toMatch(/revoke all on function public\.aprobar_promocion\(uuid, integer, text, text, uuid\) from public, anon, authenticated;/)
    expect(sql).toMatch(/grant execute on function public\.aprobar_promocion\(uuid, integer, text, text, uuid\) to service_role;/)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
})
