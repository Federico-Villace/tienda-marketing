import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/**
 * Un componente 'use client' no puede arrastrar módulos de servidor: vitest no separa servidor y
 * navegador, así que esto solo explota en `next build` (pasó con botones-formatos → pantalla →
 * componer → next/og → sharp → fs). Se recorren los imports de valor (no `import type`).
 */

const RAIZ = process.cwd()
// Solo lo que Next no reemplaza por una versión de navegador (crypto, path o zlib sí tienen polyfill).
const PROHIBIDOS = /^(node:)?(fs|fs\/promises|child_process|net|tls|worker_threads)$|^next\/og$|^next\/headers$|^sharp$|^@resvg\//

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n)
    if (statSync(r).isDirectory()) return archivos(r)
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [r] : []
  })
}

function resolver(desde: string, esp: string): string | null {
  const base = esp.startsWith('@/') ? join(RAIZ, esp.slice(2)) : esp.startsWith('.') ? join(dirname(desde), esp) : null
  if (!base) return null
  const sinExt = base.replace(/\.(ts|tsx)$/, '')
  for (const c of [base, `${sinExt}.ts`, `${sinExt}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

function importsDeValor(fuente: string): string[] {
  const salida: string[] = []
  const re = /^\s*(import|export)\s+(type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm
  for (const m of fuente.matchAll(re)) {
    if (m[5]) salida.push(m[5])
    else if (!m[2] && !/^\{\s*(type\s+[^,}]+,?\s*)+\}$/.test(m[3]!.trim())) salida.push(m[4]!)
  }
  return salida
}

function cadenaProhibida(inicio: string): string[] | null {
  const vistos = new Set<string>()
  const pila: { archivo: string; camino: string[] }[] = [{ archivo: inicio, camino: [relative(RAIZ, inicio)] }]
  while (pila.length) {
    const { archivo, camino } = pila.pop()!
    if (vistos.has(archivo)) continue
    vistos.add(archivo)
    for (const esp of importsDeValor(readFileSync(archivo, 'utf8'))) {
      if (PROHIBIDOS.test(esp)) return [...camino, esp]
      const r = resolver(archivo, esp)
      if (r) pila.push({ archivo: r, camino: [...camino, relative(RAIZ, r)] })
    }
  }
  return null
}

const clientes = ['components', 'app', 'lib']
  .flatMap((d) => archivos(join(RAIZ, d)))
  .filter((a) => /^\s*['"]use client['"]/.test(readFileSync(a, 'utf8')))

describe("límite servidor/cliente: un 'use client' no importa código de servidor", () => {
  it('hay componentes de cliente para revisar', () => {
    expect(clientes.length).toBeGreaterThan(10)
  })
  it.each(clientes.map((a) => [relative(RAIZ, a), a]))('%s', (_n, a) => {
    expect(cadenaProhibida(a)).toBeNull()
  })
})
