/**
 * Placa de la GRILLA de motos (ADR-041): las fotos reales de las motos, una tarjeta por moto con su modelo, su precio y su condición.
 * Sin IA: todo lo escribe este componente, determinísticamente, y el precio de cada moto es el cargado. Qué va dónde y a qué tamaño lo decide
 * lib/promocion/varias/grilla.ts; acá solo se pinta.
 * Mismas reglas que <Placa>: puro, sin hooks, solo estilos inline y `display: flex`, porque el MISMO árbol lo dibujan el navegador y satori.
 */

import type { CSSProperties } from 'react'
import type { LayoutGrilla, TarjetaGrilla, TextosGrilla } from '@/lib/promocion/varias/grilla'
import { enCaja, esNombre999, estiloFuente, Logo } from './comun'
import type { FamiliasDiseno, RecursosPlaca } from './tipos'

export type PropsPlacaGrilla = {
  layout: LayoutGrilla
  textos: TextosGrilla
  /** La foto de cada moto (data URI en el servidor, URL en el navegador), en el orden de las motos; null = todavía no está. */
  fotos: readonly (string | null)[]
  recursos: RecursosPlaca
  familias: FamiliasDiseno
}

const FONDO = '#0B0D12'
const TARJETA = '#161A22'
const ACENTO = '#FACC15'
const BLANCO = '#FFFFFF'
const GRIS = '#D1D5DB'

function Tarjeta({ t, foto, textos, familias, n }: { t: TarjetaGrilla; foto: string | null; textos: TextosGrilla['motos'][number]; familias: FamiliasDiseno; n: number }) {
  const anton = estiloFuente('anton', familias)
  const inter = estiloFuente('inter', familias)
  const campos = [
    t.modelo.lineas > 0 ? { clave: 'modelo', estilo: { ...anton, fontSize: t.modelo.tam, color: BLANCO, textTransform: 'uppercase' } as CSSProperties, texto: textos.modelo.trim() } : null,
    t.precio.lineas > 0 ? { clave: 'precio', estilo: { ...anton, fontSize: t.precio.tam, color: ACENTO } as CSSProperties, texto: textos.precio.trim() } : null,
    t.condicion.lineas > 0 ? { clave: 'condicion', estilo: { ...inter, fontSize: t.condicion.tam, color: GRIS } as CSSProperties, texto: textos.condicion.trim() } : null,
  ].filter((c) => c !== null)
  return (
    <>
      <div style={enCaja(t.caja, { backgroundColor: TARJETA, borderRadius: 20, overflow: 'hidden' })}>
        {foto ? (
          <img src={foto} alt={`Moto ${n}`} width={t.foto.w} height={t.foto.h} style={{ width: t.foto.w, height: t.foto.h, objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'flex', width: t.foto.w, height: t.foto.h, backgroundColor: '#2A303B' }} />
        )}
      </div>
      <div style={enCaja(t.texto, { flexDirection: 'column', justifyContent: t.orientacion === 'horizontal' ? 'center' : 'flex-start' })}>
        {campos.map((c, i) => (
          <div key={c.clave} style={{ display: 'flex', ...c.estilo, ...(i > 0 ? { marginTop: t.separacion } : {}) }}>
            {c.texto}
          </div>
        ))}
      </div>
    </>
  )
}

export function PlacaGrilla({ layout, textos, fotos, recursos, familias }: PropsPlacaGrilla) {
  const anton = estiloFuente('anton', familias)
  const inter = estiloFuente('inter', familias)
  const l = layout
  const nombre = textos.marca.trim()
  return (
    <div style={{ display: 'flex', position: 'relative', width: l.ancho, height: l.alto, backgroundColor: FONDO, overflow: 'hidden' }}>
      <div style={enCaja({ x: 0, y: 0, w: l.ancho, h: 10 }, { backgroundColor: ACENTO })} />
      {recursos.logo999 ? (
        <div style={enCaja(l.logo999, { alignItems: 'center', justifyContent: 'flex-start' })}>
          <img src={recursos.logo999} alt="" style={{ maxWidth: l.logo999.w, maxHeight: l.logo999.h, objectFit: 'contain' }} />
        </div>
      ) : null}
      {recursos.logoConcesionaria ? (
        recursos.placaClara ? (
          <div style={enCaja({ x: l.logoConcesionaria.x, y: l.logoConcesionaria.y - 6, w: l.logoConcesionaria.w, h: l.logoConcesionaria.h + 12 }, { backgroundColor: '#FFFFFF', borderRadius: 14, alignItems: 'center', justifyContent: 'center' })}>
            <img src={recursos.logoConcesionaria} alt="" style={{ maxWidth: l.logoConcesionaria.w - 24, maxHeight: l.logoConcesionaria.h, objectFit: 'contain' }} />
          </div>
        ) : (
          <Logo src={recursos.logoConcesionaria} caja={l.logoConcesionaria} />
        )
      ) : nombre !== '' && !esNombre999(nombre) ? (
        <div style={enCaja(l.logoConcesionaria, { alignItems: 'center', justifyContent: 'flex-end', ...inter, fontSize: 28, color: BLANCO, textTransform: 'uppercase', letterSpacing: 3 })}>{nombre}</div>
      ) : null}
      {l.titular.lineas > 0 ? (
        <div style={enCaja(l.titular.caja, { alignItems: 'center', ...anton, fontSize: l.titular.tam, color: BLANCO, textTransform: 'uppercase', letterSpacing: 1 })}>{textos.titular.trim()}</div>
      ) : null}
      {l.tarjetas.map((t, i) => (
        <Tarjeta key={i} t={t} foto={fotos[i] ?? null} textos={textos.motos[i]!} familias={familias} n={i + 1} />
      ))}
      {l.extra.lineas > 0 ? (
        <div style={enCaja(l.extra.caja, { alignItems: 'center', ...inter, fontSize: l.extra.tam, color: ACENTO, textTransform: 'uppercase', letterSpacing: 2 })}>{textos.extra.trim()}</div>
      ) : null}
      {l.lugar.lineas > 0 ? (
        <div style={enCaja(l.lugar.caja, { alignItems: 'center', ...inter, fontSize: l.lugar.tam, color: GRIS })}>{textos.lugar.trim()}</div>
      ) : null}
    </div>
  )
}
