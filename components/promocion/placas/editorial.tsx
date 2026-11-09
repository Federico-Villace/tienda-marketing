/**
 * Plantilla "Editorial": fondo crema con curvas de nivel, marca y modelo en negro, un número gigante detrás de la
 * moto (sobre un círculo de acento), lista lateral, bajada espaciada y una banda negra inclinada con el precio.
 * Orden de capas: crema → curvas → número → círculo → escena (con los bordes transparentes) → textos → banda.
 * La escena se funde con una máscara radial: así el número "se ve detrás" de la moto en los bordes.
 */

import { curvasDeNivel } from '@/lib/promocion/diseno/decorados'
import { BASE, BLANCO, colorDe, NEGRO } from '@/lib/promocion/diseno/paletas'
import { enCaja, ImagenCompleta, lienzo, Logo, LogoConcesionaria, Pastilla, Pin } from './comun'
import type { PropsPlacaDiseno } from './tipos'

const SEMILLA = 20261111

export function PlacaEditorial(p: PropsPlacaDiseno) {
  const { layout, ajuste, recursos, familias: f, textos, diseno } = p
  const { cajas } = layout
  const base = BASE.editorial
  const acento = colorDe('editorial', diseno.acento)
  const esc = cajas.escena
  const numero = cajas.numero
  const circulo = cajas.circulo
  const lista = cajas.lista
  const banda = cajas.banda
  const condicion = diseno.condicion
  if (!numero || !circulo || !lista || !banda) throw new Error('El layout de la editorial está incompleto.')

  return (
    <div style={lienzo(p, base.fondo)}>
      <svg width={layout.ancho} height={layout.alto} viewBox={`0 0 ${layout.ancho} ${layout.alto}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {curvasDeNivel(layout.ancho, layout.alto, SEMILLA).map((x, i) => (
          <path key={i} d={x.d} fill="none" stroke={NEGRO} strokeWidth={1.5} opacity={x.opacidad} />
        ))}
      </svg>

      {/* Número gigante, detrás de todo lo demás */}
      {ajuste.numeroTam > 0 ? (
        <div style={enCaja(numero, { alignItems: 'center', justifyContent: 'center', fontFamily: f['sora-extrabold'], fontWeight: 800, fontSize: ajuste.numeroTam, lineHeight: 1, color: NEGRO })}>{diseno.numero}</div>
      ) : null}

      <div style={enCaja(circulo, { backgroundColor: acento.hex, borderRadius: 9999 })} />

      {/* La moto: la escena con los bordes transparentes (máscara radial) */}
      <div style={enCaja(esc, { maskImage: 'radial-gradient(ellipse 62% 58% at 50% 50%, #000 62%, rgba(0,0,0,0) 100%)' })}>
        <ImagenCompleta src={p.escenaSrc} caja={{ x: 0, y: 0, w: esc.w, h: esc.h }} />
      </div>

      {recursos.logo999 ? <Logo src={recursos.logo999} caja={cajas.logo999} /> : null}
      {recursos.logoMarca ? <Logo src={recursos.logoMarca} caja={cajas.logoMarca} /> : null}

      <div style={enCaja(cajas.modelo, { alignItems: 'center', fontFamily: f['sora-extrabold'], fontWeight: 800, fontSize: ajuste.modelo.tam, lineHeight: 1.2, color: NEGRO, textTransform: 'uppercase' })}>{textos.modelo.trim()}</div>

      {ajuste.listaTam > 0 ? (
        <div style={enCaja(lista, { flexDirection: 'column', justifyContent: 'center', fontFamily: f['sora-semibold'], fontWeight: 600, fontSize: ajuste.listaTam, lineHeight: 1.25, color: NEGRO, textTransform: 'uppercase', letterSpacing: 2 })}>
          {diseno.lista.map((x, i) => (
            <div key={i} style={{ display: 'flex', marginBottom: Math.round(ajuste.listaTam * 0.9) }}>{x}</div>
          ))}
        </div>
      ) : null}

      {ajuste.frase.lineas > 0 ? (
        <div style={enCaja(cajas.frase, { alignItems: 'center', fontFamily: f['sora-semibold'], fontWeight: 600, fontSize: ajuste.frase.tam, color: NEGRO, textTransform: 'uppercase', letterSpacing: 6 })}>
          <div style={{ display: 'flex' }}>{diseno.frase}</div>
          <div style={{ display: 'flex', flex: 1, height: 2, marginLeft: 24, backgroundColor: NEGRO }} />
        </div>
      ) : null}

      {/* Banda negra inclinada con el precio, la condición y el pie */}
      <div style={enCaja(banda, { backgroundColor: NEGRO, transform: 'skewY(-2deg)' })} />
      <div style={enCaja(cajas.precio, { alignItems: 'center', fontFamily: f['sora-extrabold'], fontWeight: 800, fontSize: ajuste.precio.tam, lineHeight: 1.2, color: BLANCO })}>{ajuste.textoPrecio}</div>
      {ajuste.filasCondicion > 0 ? (
        <div style={enCaja(cajas.condicion, { flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' })}>
          {condicion.texto ? <div style={{ display: 'flex', fontFamily: f['sora-semibold'], fontWeight: 600, fontSize: ajuste.condicionTam, lineHeight: 1.2, color: BLANCO, textTransform: 'uppercase' }}>{condicion.texto}</div> : null}
          {condicion.destacado ? (
            <Pastilla fondo={acento.hex} color={acento.sobre} tam={ajuste.condicionTam} familia={f['sora-extrabold']}>
              {condicion.destacado}
            </Pastilla>
          ) : null}
        </div>
      ) : null}
      <div style={enCaja(cajas.pie, { alignItems: 'center', justifyContent: 'space-between' })}>
        <Pastilla fondo={acento.hex} color={acento.sobre} tam={ajuste.ctaTam} familia={f['sora-extrabold']}>
          {diseno.cta}
        </Pastilla>
        <div style={{ display: 'flex', alignItems: 'center', fontFamily: f['sora-semibold'], fontWeight: 600, fontSize: ajuste.lugarTam, color: BLANCO, textTransform: 'uppercase' }}>
          <Pin tam={Math.round(ajuste.lugarTam * 1.2)} color={acento.hex} />
          <div style={{ display: 'flex', marginLeft: 8 }}>{textos.lugar.trim()}</div>
        </div>
      </div>

      <LogoConcesionaria p={p} color={NEGRO} familia={f['sora-extrabold']} />
    </div>
  )
}
