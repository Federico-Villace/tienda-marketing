'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { postFoto } from '@/components/creativos/api'
import { comprimir, depsDeNavegador, type ResultadoCompresion } from '@/lib/productor/redimensionar'

const comprimirEnNavegador = (archivo: File): Promise<ResultadoCompresion> => comprimir(archivo, depsDeNavegador())

/** En cola = elegida pero todavía sin subir (falta la declaración de derechos o un lugar entre las 2 subidas a la vez). */
export type EstadoSubida = 'en_cola' | 'subiendo' | 'lista' | 'error'
export type FilaSubida = { estado: EstadoSubida; archivo: File; vista: string | null; fotoId: string | null; error: string | null; version: number }

/**
 * La subida de las N fotos de un lote (ADR-032): cada foto se sube al elegirla, de a `concurrencia`
 * (2 por defecto), con su estado y su reintento por fila. Nada se sube hasta que la persona acepta la
 * declaración de derechos del lote (una sola para todas; el servidor la registra en cada foto). Como
 * la subida de una sola foto (SubirFoto), la imagen se achica en el navegador y sale sin EXIF.
 * `clave` identifica la fila del formulario (la moto 1, la moto 2...).
 */
export function usarSubidaLote({
  derechos,
  concurrencia = 2,
  comprimirFoto = comprimirEnNavegador,
}: {
  derechos: boolean
  concurrencia?: number
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
}) {
  const [filas, setFilas] = useState<Record<string, FilaSubida>>({})
  // Cada intento tiene su versión: si la fila cambió mientras subía, el resultado viejo se descarta.
  const iniciadas = useRef(new Set<string>())
  const versiones = useRef<Record<string, number>>({})
  const vistas = useRef(new Set<string>())

  const soltarVista = (v: string | null) => {
    if (!v) return
    try {
      URL.revokeObjectURL(v)
    } catch {
      // Sin vista previa el flujo sigue igual.
    }
    vistas.current.delete(v)
  }
  useEffect(
    () => () => {
      for (const v of vistas.current) {
        try {
          URL.revokeObjectURL(v)
        } catch {
          // idem
        }
      }
    },
    [],
  )

  const elegir = useCallback((clave: string, archivo: File) => {
    const version = (versiones.current[clave] ?? 0) + 1
    versiones.current[clave] = version
    let vista: string | null = null
    try {
      vista = URL.createObjectURL(archivo)
      vistas.current.add(vista)
    } catch {
      // Sin vista previa el flujo sigue igual.
    }
    setFilas((f) => {
      soltarVista(f[clave]?.vista ?? null)
      return { ...f, [clave]: { estado: 'en_cola', archivo, vista, fotoId: null, error: null, version } }
    })
  }, [])

  const quitar = useCallback((clave: string) => {
    versiones.current[clave] = (versiones.current[clave] ?? 0) + 1
    setFilas((f) => {
      soltarVista(f[clave]?.vista ?? null)
      const { [clave]: _fuera, ...resto } = f
      return resto
    })
  }, [])

  const reintentar = useCallback((clave: string) => {
    const version = (versiones.current[clave] ?? 0) + 1
    versiones.current[clave] = version
    setFilas((f) => (f[clave] ? { ...f, [clave]: { ...f[clave]!, estado: 'en_cola', error: null, version } } : f))
  }, [])

  async function subir(clave: string, fila: FilaSubida) {
    const ahora = (cambios: Partial<FilaSubida>) =>
      setFilas((f) => (f[clave] && f[clave]!.version === fila.version ? { ...f, [clave]: { ...f[clave]!, ...cambios } } : f))
    const c = await comprimirFoto(fila.archivo)
    if (!c.ok) return ahora({ estado: 'error', error: c.error })
    const formulario = new FormData()
    formulario.set('foto', c.blob, 'foto.jpg')
    formulario.set('derechos', 'acepto')
    const r = await postFoto(formulario)
    if (!r.ok) return ahora({ estado: 'error', error: r.error })
    ahora({ estado: 'lista', fotoId: r.foto.id, error: null })
  }

  // La cola: con la declaración aceptada, arranca las que entren en el cupo de subidas a la vez.
  useEffect(() => {
    if (!derechos) return
    const enVuelo = Object.values(filas).filter((x) => x.estado === 'subiendo').length
    const libres = concurrencia - enVuelo
    if (libres <= 0) return
    const proximas = Object.entries(filas)
      .filter(([clave, x]) => x.estado === 'en_cola' && !iniciadas.current.has(`${clave}:${x.version}`))
      .slice(0, libres)
    if (proximas.length === 0) return
    for (const [clave, x] of proximas) iniciadas.current.add(`${clave}:${x.version}`)
    setFilas((f) => {
      const copia = { ...f }
      for (const [clave, x] of proximas) if (copia[clave]?.version === x.version) copia[clave] = { ...copia[clave]!, estado: 'subiendo' }
      return copia
    })
    for (const [clave, x] of proximas) void subir(clave, x)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, derechos, concurrencia])

  const listas = useCallback((claves: readonly string[]) => claves.every((c) => filas[c]?.estado === 'lista'), [filas])

  return { filas, elegir, quitar, reintentar, listas }
}
