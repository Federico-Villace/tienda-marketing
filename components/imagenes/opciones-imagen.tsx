'use client'

import type { ReactNode } from 'react'
import type { FotoSubida } from '@/components/creativos/api'
import { SubirFoto } from '@/components/creativos/subir-foto'
import { boton, campo, tarjetaOpcion } from '@/components/promocion/ui'
import { formatearUsd } from '@/lib/estratega/formato'
import { MAX_DESCRIPCION_FONDO } from '@/lib/imagenes/fondos'
import type { MotorImagen, OpcionesImagen as Opciones } from '@/lib/imagenes/opciones'
import type { ResultadoCompresion } from '@/lib/productor/redimensionar'

export type InspiracionVista = { id: string; url: string | null; borrada: boolean }

/** "rápido y barato" para el motor más barato; para el resto, cuántas veces cuesta de más. */
function leyendaMotor(m: MotorImagen, motores: readonly MotorImagen[]): string {
  const minimo = Math.min(...motores.map((x) => x.porImagenUsd))
  if (m.porImagenUsd <= minimo) return 'rápido y barato'
  return `más fiel, ~${Math.max(2, Math.round(m.porImagenUsd / minimo))}× el precio`
}

/**
 * Las opciones de una imagen con la foto real de una moto: fondo, descripción, foto de inspiración,
 * motor y cantidad. SON LAS MISMAS en Promociones y en /creativos (ADR-034): el que cambia es el
 * contenedor (qué se guarda y qué más se pregunta), no este bloque. Lo propio de cada sección va en
 * `extras`. No gasta nada: eso lo hace la compuerta.
 */
export function OpcionesImagen({
  opciones,
  fondo,
  onFondo,
  descripcion,
  onDescripcion,
  onDescripcionBlur,
  indicadorDescripcion,
  inspiracion,
  onInspiracion,
  comprimirFoto,
  motor,
  onMotor,
  cantidad,
  onCantidad,
  puede,
  ocupado,
  conFondo = true,
  extras,
}: {
  opciones: Opciones
  fondo: string | null
  onFondo: (id: string) => void
  descripcion: string
  onDescripcion: (texto: string) => void
  onDescripcionBlur?: () => void
  /** "Guardado", "Sin guardar…": solo donde la descripción se guarda sola. */
  indicadorDescripcion?: ReactNode
  inspiracion: InspiracionVista | null
  /** La foto recién subida, o null para quitarla. */
  onInspiracion: (foto: FotoSubida | null) => void
  comprimirFoto?: (archivo: File) => Promise<ResultadoCompresion>
  motor: string
  onMotor: (id: string) => void
  cantidad: number
  onCantidad: (n: number) => void
  puede: boolean
  ocupado: boolean
  /** Una imagen desde un texto (sin foto de la moto) no tiene fondo, descripción ni inspiración: solo motor y cantidad. */
  conFondo?: boolean
  extras?: ReactNode
}) {
  const bloqueado = !puede || ocupado
  return (
    <div className="space-y-8" data-testid="opciones-imagen">
      {conFondo && (
        <>
      <fieldset role="radiogroup" disabled={bloqueado} className="min-w-0 space-y-2">
        <legend className="mb-1 text-sm font-medium">Fondo</legend>
        {opciones.fondos.map((f) => (
          <label key={f.id} className={tarjetaOpcion}>
            <input type="radio" name="fondo" checked={fondo === f.id} onChange={() => onFondo(f.id)} className="mt-1" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {f.nombre}
                {fondo === f.id && <span className="ml-2 text-xs font-normal text-(--color-ok)">Elegido</span>}
              </span>
              <span className="block text-xs text-(--color-tenue)">{f.descripcion}</span>
            </span>
          </label>
        ))}
        {fondo !== 'solo_descripcion' && descripcion.trim() !== '' && (
          <p className="text-xs text-(--color-tenue)">Escribiste una descripción: manda lo que escribiste y este fondo queda solo de base.</p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={`descripcion-${opciones.seccion}`} className="text-sm font-medium">
          Descripción del fondo (opcional)
        </label>
        <textarea
          id={`descripcion-${opciones.seccion}`}
          className={campo}
          rows={3}
          maxLength={MAX_DESCRIPCION_FONDO}
          value={descripcion}
          disabled={!puede}
          placeholder="Ej.: una calle de noche con luces cálidas y el cielo despejado"
          onChange={(e) => onDescripcion(e.target.value)}
          onBlur={onDescripcionBlur}
        />
        <p className="text-xs text-(--color-tenue) tabular-nums">
          {descripcion.length}/{MAX_DESCRIPCION_FONDO} · La moto no se modifica: esto solo describe el fondo. Si lo cambiás, conviene generar otra imagen.
        </p>
        {indicadorDescripcion}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Foto de inspiración (opcional)</h3>
        <p className="text-xs text-(--color-tenue)">Una imagen de referencia para copiar el estilo, la luz y el ambiente; la moto es siempre la de tu foto.</p>
        {inspiracion ? (
          <div className="flex items-start gap-3">
            {inspiracion.url && !inspiracion.borrada ? (
              <img src={inspiracion.url} alt="Foto de inspiración" loading="lazy" className="max-h-32 rounded-md border border-(--color-borde)" />
            ) : (
              <p className="text-sm">La foto de inspiración se borró: sacala o subí otra.</p>
            )}
            {puede && (
              <button type="button" className={boton} disabled={ocupado} onClick={() => onInspiracion(null)}>
                Quitar la foto de inspiración
              </button>
            )}
          </div>
        ) : (
          puede && <SubirFoto puedeEditar uso="inspiracion" {...(comprimirFoto ? { comprimirFoto } : {})} alSubir={(foto) => onInspiracion(foto)} />
        )}
        <p className="text-xs text-(--color-tenue)">Suma una imagen de entrada al precio: lo ves en "Ver precio", antes de gastar.</p>
      </div>

        </>
      )}

      {extras}

      <fieldset role="radiogroup" disabled={bloqueado} className="min-w-0 space-y-2">
        <legend className="mb-1 text-sm font-medium">Motor</legend>
        {opciones.motores.map((m) => (
          <label key={m.id} className={tarjetaOpcion}>
            <input type="radio" name="motor" checked={motor === m.id} onChange={() => onMotor(m.id)} className="mt-1" />
            <span className="min-w-0 flex-1 font-medium">
              {m.nombre} · {leyendaMotor(m, opciones.motores)}
            </span>
            <span className="text-xs whitespace-nowrap text-(--color-tenue) tabular-nums">~{formatearUsd(m.porImagenUsd)} c/u</span>
          </label>
        ))}
      </fieldset>

      <label className="block max-w-48 text-sm">
        Variantes
        <select className={campo} value={cantidad} disabled={bloqueado} onChange={(e) => onCantidad(Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
