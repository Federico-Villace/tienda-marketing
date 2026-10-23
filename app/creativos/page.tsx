import { headers } from 'next/headers'
import { Compuerta } from '@/components/creativos/compuerta'
import { CrearImagen } from '@/components/creativos/crear-imagen'
import { GaleriaImagenes } from '@/components/creativos/galeria-imagenes'
import { Aviso, Encabezado, Navegacion } from '@/components/navegacion'
import { leerRol, puedeEditar } from '@/lib/agentes/pantalla'
import { HEADER_USUARIO } from '@/lib/auth/acceso'
import { leerTope } from '@/lib/productor/autorizar'
import { menuConPrecios } from '@/lib/productor/ediciones'
import { leerPantallaProductor, type PantallaProductor } from '@/lib/productor/pantalla'
import { MOTOR_IMAGEN_POR_DEFECTO, PRECIOS_IMAGEN, tienePrecioImagen } from '@/lib/productor/precios'

export const dynamic = 'force-dynamic'

export default async function Creativos({ searchParams }: { searchParams: Promise<{ pieza?: string }> }) {
  const consulta = await searchParams
  // Lo pone proxy.ts tras verificar la sesión. Solo decide qué botones se ven: el endpoint manda.
  const usuarioId = (await headers()).get(HEADER_USUARIO)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()

  // El Productor gasta solo con clave de Gemini Y un tope mensual válido. Al cliente va el motivo en castellano, nunca la clave.
  const topeUsd = leerTope(process.env.PRESUPUESTO_MENSUAL_USD)
  const apagado = !process.env.GEMINI_API_KEY?.trim()
    ? 'Generar imágenes está apagado: falta la clave de Gemini. Avisale a quien administra el sistema.'
    : topeUsd === null
      ? 'Generar imágenes está apagado: falta definir el tope de gasto mensual. Avisale a quien administra el sistema.'
      : null
  const modeloConfigurado = process.env.MODELO_IMAGEN?.trim()
  const motorPorDefecto = modeloConfigurado && tienePrecioImagen(modeloConfigurado) ? modeloConfigurado : MOTOR_IMAGEN_POR_DEFECTO
  const motores = Object.entries(PRECIOS_IMAGEN).map(([id, p]) => ({ id, nombre: p.nombre, porImagenUsd: p.porImagen1K }))

  // Precios informativos del menú (por imagen, con la foto de entrada). Al estimar, el servidor los recalcula.
  const menuPorMotor = Object.fromEntries(Object.keys(PRECIOS_IMAGEN).map((id) => [id, menuConPrecios(id, 1)]))

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
        bajada="Partí de una foto real de tu moto o de un texto ya aprobado, mirá cuánto cuesta y confirmá con un click. El servidor calcula el precio, respeta el tope mensual y registra el costo real de cada imagen."
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
        <>
          <CrearImagen
            piezas={datos.pantalla.piezas}
            fotos={datos.pantalla.fotos}
            piezaInicialId={consulta.pieza ?? null}
            puedeEditar={puedeEditar(datos.rol)}
            apagado={apagado}
            topeUsd={topeUsd}
            gastadoUsd={datos.pantalla.gastadoUsd}
            motores={motores}
            motorPorDefecto={motorPorDefecto}
            menuPorMotor={menuPorMotor}
          />

          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold tracking-widest text-(--color-tenue) uppercase">Imágenes generadas</h2>
            <GaleriaImagenes
              piezas={datos.pantalla.piezas}
              fotos={datos.pantalla.fotos}
              puedeEditar={puedeEditar(datos.rol)}
            />
          </section>
        </>
      )}

      <details className="mt-12 border-t border-(--color-borde) pt-6">
        <summary className="cursor-pointer text-sm font-medium">¿Cuánto cuesta cada opción?</summary>
        <div className="mt-6">
          <Compuerta />
        </div>
      </details>
    </main>
  )
}
