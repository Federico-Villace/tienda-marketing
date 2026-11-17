import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const archivo = '20261120120000_varias_motos.sql'
const leer = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8')
const sql = leer(archivo)
const anterior = leer('20261118120000_copia_fiel.sql')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const activo = sinComentarios(sql)
const plano = (s: string) => s.replace(/\s+/g, ' ')

const funcion = (nombre: string, src = sql) => {
  const m = src.match(new RegExp(`create (?:or replace )?function public\\.${nombre}\\([\\s\\S]*?\\n\\$\\$;`))
  if (!m) throw new Error(`no existe ${nombre}`)
  return m[0]
}

describe('migración varias-motos · la columna', () => {
  it('el timestamp es posterior a la última migración (20261119120000)', () => {
    expect(Number(archivo.slice(0, 14))).toBeGreaterThan(20261119120000)
  })
  it('suma motos_extra como jsonb nullable: una lista de 1 a 3 motos y de tamaño acotado', () => {
    const a = plano(activo)
    expect(a).toMatch(/alter table public\.promociones add column motos_extra jsonb/)
    expect(a).toMatch(/case when jsonb_typeof\(motos_extra\) = 'array' then jsonb_array_length\(motos_extra\) between 1 and 3 else false end/)
    expect(a).toMatch(/pg_column_size\(motos_extra\) <= 4096/)
  })
  it('es aditiva: sin default y sin tocar las filas que ya hay (todas quedan null)', () => {
    expect(activo).not.toMatch(/drop table|drop column/i)
    expect(plano(activo)).not.toMatch(/motos_extra jsonb[^,;]*(default|not null)/i)
    expect(activo).not.toMatch(/set\s+motos_extra/i)
  })
  it('una placa de varias motos es una promoción suelta: nunca de una tanda ni de un lote', () => {
    expect(plano(activo)).toMatch(/check \(motos_extra is null or \(tanda_id is null and grupo is null and variante is null\)\)/)
  })
  it('solo admite la copia fiel o la grilla (o ninguna todavía): las otras plantillas llevan una sola moto', () => {
    expect(plano(activo)).toMatch(/check \(motos_extra is null or plantilla is null or plantilla in \('copia_fiel', 'varias_motos'\)\)/)
  })
  it('la grilla exige varias motos', () => {
    expect(plano(activo)).toMatch(/check \(plantilla is distinct from 'varias_motos' or motos_extra is not null\)/)
  })
})

describe('migración varias-motos · las motos no se cambian', () => {
  const f = funcion('promociones_motos_extra_fija')
  it('un trigger antes de actualizar la columna rechaza cualquier cambio', () => {
    expect(plano(activo)).toMatch(/create trigger promociones_motos_extra_fija before update of motos_extra on public\.promociones for each row execute function public\.promociones_motos_extra_fija\(\)/)
    expect(f).toMatch(/new\.motos_extra is distinct from old\.motos_extra/)
    expect(f).toMatch(/errcode = 'PT422'/)
  })
  it('la función corre con search_path vacío y nadie la ejecuta de afuera', () => {
    expect(f).toMatch(/set search_path = ''/)
    expect(activo).toMatch(/revoke all on function public\.promociones_motos_extra_fija\(\) from public, anon, authenticated/)
  })
})

describe('migración varias-motos · aprobar_promocion', () => {
  const f = funcion('aprobar_promocion')
  const previa = funcion('aprobar_promocion', anterior)
  it('conserva la firma (create or replace, mismos cinco parámetros)', () => {
    expect(f).toMatch(/^create or replace function public\.aprobar_promocion\(p_id uuid, p_revision integer, p_placa_ruta text, p_placa_hash text, p_usuario uuid\)/)
  })
  it('el snapshot suma las otras motos (lo que se aprobó queda completo)', () => {
    expect(f).toMatch(/'motos_extra', v_promo\.motos_extra/)
  })
  it('la grilla se aprueba sin escena de IA; todo lo demás sigue exigiéndola', () => {
    expect(plano(f)).toMatch(/\(v_promo\.escena_creativo_id is null and v_promo\.plantilla is distinct from 'varias_motos'\) or p_placa_ruta is null or p_placa_hash is null/)
  })
  it('la copia fiel sigue exigiendo una verificación ok (también con varias motos)', () => {
    expect(f).toMatch(/v_promo\.plantilla = 'copia_fiel'/)
    expect(f).toMatch(/v_ver_estado <> 'ok'/)
    expect(f).toMatch(/'verificacion_id', v_verificacion/)
  })
  it('todo lo demás es igual a la versión anterior (solo difieren la condición de la escena y el snapshot)', () => {
    const normal = (s: string) =>
      plano(s)
        .replace(/\(v_promo\.escena_creativo_id is null and v_promo\.plantilla is distinct from 'varias_motos'\) or/, 'v_promo.escena_creativo_id is null or')
        .replace(/'referencia_diseno_id', v_promo\.referencia_diseno_id,? ?'motos_extra', v_promo\.motos_extra/, "'referencia_diseno_id', v_promo.referencia_diseno_id")
        .replace(/create or replace function public\.aprobar_promocion\(/, 'create function (')
    expect(normal(f)).toBe(normal(previa))
  })
  it('permisos: solo service_role', () => {
    expect(activo).toMatch(/revoke all on function public\.aprobar_promocion\(uuid, integer, text, text, uuid\) from public, anon, authenticated/)
    expect(activo).toMatch(/grant execute on function public\.aprobar_promocion\(uuid, integer, text, text, uuid\) to service_role/)
  })
})

describe('migración varias-motos · la regla 5 y los secretos', () => {
  it('no abre ninguna política de escritura al cliente ni guarda tokens', () => {
    expect(activo).not.toMatch(/create policy|grant (insert|update|delete)/i)
    expect(activo).not.toMatch(/token|secret|api[_-]?key/i)
  })
  it('trae su bajada comentada', () => {
    expect(sql).toMatch(/-- BAJADA/)
    expect(sql).toMatch(/-- alter table public\.promociones drop constraint/)
    expect(sql).toMatch(/-- alter table public\.promociones drop column motos_extra/)
  })
})
