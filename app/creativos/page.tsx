import { headers } from 'next/headers'
import { Compuerta } from '@/components/creativos/compuerta'
import { Productor } from '@/components/creativos/productor'
import { Aviso, Encabezado, Navegacion } from '@/components/navegacion'
import { leerRol, puedeEditar } from '@/lib/agentes/pantalla'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { buscarMotor } from '@/lib/creativos/motores'
import { formatearUsd } from '@/lib/estratega/formato'
import { leerTope } from '@/lib/productor/autorizar'
import { leerPantallaProductor, type PantallaProductor } from '@/lib/productor/pantalla'
import { MOTOR_IMAGEN_POR_DEFECTO, PRECIOS_IMAGEN, tienePrecioImagen } from '@/lib/productor/precios'

export const dynamic = 'force-dynamic'

/** El menú de la foto subida (próximo cambio), con los precios del catálogo. */
const precio = (id: string, unidades: number) => {
  const m = buscarMotor(id)
  return m ? { motor: m.nombre, cuenta: `${unidades} × ${formatearUsd(m.precioMin)}`, total: formatearUsd(unidades * m.precioMin) } : null
}
const MENU = [
  ['3 variantes de fondo', precio('gemini-nano-banana-2.1', 3)],
  ['Carrusel de 5 piezas', precio('gemini-nano-banana-2.1', 5)],
  ['Video de 8s animando la cámara (referencial)', precio('runway-gen4-turbo', 8)],
  ['Video de 8s con Gemini Omni (referencial)', precio('gemini-omni-1.1-flash', 8)],
] as const

export default async function Creativos({ searchParams }: { searchParams: Promise<{ pieza?: string }> }) {
  const consulta = await searchParams
  // Lo pone proxy.ts tras verificar la sesión. Solo decide qué botones se ven: el endpoint manda.
  const usuarioId = (await headers()).get(HEADER_USUARIO)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()

  // El Productor gasta solo con clave de Gemini Y un tope mensual válido. Al cliente va el motivo, nunca la clave.
  const topeUsd = leerTope(process.env.PRESUPUESTO_MENSUAL_USD)
  const apagado = !process.env.GEMINI_API_KEY?.trim()
    ? 'Falta GEMINI_API_KEY: el Productor está deshabilitado.'
    : topeUsd === null
      ? 'Sin PRESUPUESTO_MENSUAL_USD el Productor está apagado.'
      : null
  const modeloConfigurado = process.env.MODELO_IMAGEN?.trim()
  const motorPorDefecto = modeloConfigurado && tienePrecioImagen(modeloConfigurado) ? modeloConfigurado : MOTOR_IMAGEN_POR_DEFECTO
  const motores = Object.entries(PRECIOS_IMAGEN).map(([id, p]) => ({ id, nombre: p.nombre, porImagenUsd: p.porImagen1K }))

  type Datos = { tipo: 'ok'; pantalla: PantallaProductor; rol: string | null } | { tipo: 'error'; mensaje: string }
  let datos: Datos
  if (!url || !secretKey) {
    datos = { tipo: 'error', mensaje: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.' }
  } else {
    const s = { url, secretKey }
    try {
      const [pantalla, rol] = await Promise.all([leerPantallaProductor(s, fetch), leerRol(s, usuarioId, fetch)])
      datos = { tipo: 'ok', pantalla, rol }
    } catch (e) {
      datos = { tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) }
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <Navegacion activa="/creativos" />
      <Encabezado
        fase="Fase 3"
        agente="Productor"
        titulo="Imágenes con compuerta de costo"
        bajada="Elegí una pieza aprobada, mirá cuánto cuesta y confirmá con un click. El servidor calcula el precio, respeta el tope mensual y registra el costo real de cada imagen."
      />
      <Aviso>
        Cada imagen cuesta plata real: se estima, la confirmás con un click y se registra el costo real. La IA puede inventar
        detalles de la moto: revisala antes de usarla.
      </Aviso>

      {datos.tipo === 'error' ? (
        <p role="alert" className="rounded-md border border-(--color-falta) px-3 py-2 text-sm">
          No se pudieron cargar los creativos: {datos.mensaje}
        </p>
      ) : (
        <Productor
          piezas={datos.pantalla.piezas}
          piezaInicialId={consulta.pieza ?? null}
          puedeEditar={puedeEditar(datos.rol)}
          apagado={apagado}
          topeUsd={topeUsd}
          gastadoUsd={datos.pantalla.gastadoUsd}
          motores={motores}
          motorPorDefecto={motorPorDefecto}
        />
      )}

      <section className="mt-12 border-t border-(--color-borde) pt-8">
        <Compuerta />
      </section>

      <section className="mt-12 border-t border-(--color-borde) pt-8">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">
          Subir una imagen y ver qué se puede hacer
          <span className="ml-2 rounded-md border border-(--color-borde) px-2 py-0.5 font-mono text-[0.65rem] normal-case">
            Próximo cambio (productor-foto)
          </span>
        </h2>
        <div className="rounded-lg border border-dashed border-(--color-borde) px-4 py-8 text-center">
          <p className="text-sm text-(--color-tenue)">Arrastrá una foto de una moto</p>
          <p className="mt-1 text-xs text-(--color-tenue)">
            El Productor la analiza con un modelo de visión (centavos) y devuelve un menú de opciones con precio
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {MENU.map(([que, p]) =>
            p ? (
              <li
                key={que}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-(--color-borde) px-4 py-2.5"
              >
                <div>
                  <p className="text-sm">{que}</p>
                  <p className="text-xs text-(--color-tenue)">
                    {p.motor} · {p.cuenta}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{p.total}</span>
              </li>
            ) : null,
          )}
        </ul>
        <p className="mt-3 text-xs text-(--color-tenue)">
          Ese menú es el corazón de la idea: la foto no se transforma sola. Primero ves qué se puede hacer y cuánto sale cada
          cosa. Todavía no está disponible.
        </p>
      </section>
    </main>
  )
}
