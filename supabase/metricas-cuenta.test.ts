import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261024120000_metricas_cuenta.sql'), 'utf8')
// Sin comentarios: lo que cuenta es el SQL ejecutable.
const ejecutable = sql.replace(/--.*$/gm, '')

describe('migración de metricas_cuenta (mensajes recibidos, ADR-020)', () => {
  it('una fila por cuenta y día, con la organización y el crudo', () => {
    expect(ejecutable).toMatch(/create table public\.metricas_cuenta/)
    expect(ejecutable).toMatch(/organizacion_id\s+uuid not null references public\.organizaciones\(id\) on delete cascade/)
    expect(ejecutable).toMatch(/cuenta_id\s+uuid not null references public\.cuentas_meta\(id\) on delete cascade/)
    expect(ejecutable).toMatch(/fecha\s+date not null/)
    expect(ejecutable).toMatch(/crudo\s+jsonb not null/)
    expect(ejecutable).toMatch(/unique \(cuenta_id, fecha\)/)
  })

  it('los conteos son nullable: null = Meta no lo informa', () => {
    for (const col of ['conversaciones_activas', 'conversaciones_nuevas', 'mensajes']) {
      expect(ejecutable).toMatch(new RegExp(`${col}\\s+integer,`))
    }
  })

  it('privacidad: no hay ninguna columna que pueda guardar contenido o participantes', () => {
    const tabla = ejecutable.match(/create table public\.metricas_cuenta \([\s\S]*?\n\);/)![0]
    expect(tabla).not.toMatch(/\b(texto|mensaje|snippet|participante|remitente|conversacion_id|nombre)\b/i)
  })

  it('RLS: lectura por pertenencia y ninguna política de escritura', () => {
    expect(ejecutable).toMatch(/alter table public\.metricas_cuenta enable row level security/)
    expect(ejecutable).toMatch(/create policy "lectura por pertenencia" on public\.metricas_cuenta\s+for select using \(public\.es_miembro\(organizacion_id\)\)/)
    expect(ejecutable).not.toMatch(/for (insert|update|delete|all)/i)
  })

  it('resumen_mensajes: stable, search_path vacío y p_hasta opcional', () => {
    expect(ejecutable).toMatch(
      /create function public\.resumen_mensajes\(p_organizacion uuid, p_desde date, p_hasta date default null\)/,
    )
    expect(ejecutable).toMatch(/\bstable\b/)
    expect(ejecutable).toMatch(/set search_path = ''/)
    expect(ejecutable).toMatch(/\(p_hasta is null or m\.fecha <= p_hasta\)/)
    expect(ejecutable).toMatch(/cm\.tipo/)
    expect(ejecutable).toMatch(/cm\.meta_id/)
  })

  it('solo service_role puede ejecutarla', () => {
    expect(ejecutable).toMatch(
      /revoke all on function public\.resumen_mensajes\(uuid, date, date\) from public, anon, authenticated;/,
    )
    expect(ejecutable).toMatch(/grant execute on function public\.resumen_mensajes\(uuid, date, date\) to service_role;/)
    expect(ejecutable).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i)
  })
})
