/** Datos de prueba de la promoción. Solo los usan los tests. */

import { MARCAS } from '../datos/marcas.ts'
import { ORGANIZACION_PILOTO_ID } from '../organizacion.ts'
import type { CopyPromo, DatosPromocion, FilaPromocion } from './tipos.ts'

export const ID_PROMO = '22222222-2222-4222-8222-222222222222'
export const ID_FOTO = '11111111-1111-4111-8111-111111111111'
export const ID_ESCENA = '33333333-3333-4333-8333-333333333333'

export const datosDePrueba = (): DatosPromocion => ({
  precio: { moneda: 'ARS', monto: 4_500_000 },
  promo: { tipo: 'cuotas', detalle: '12 cuotas sin interés' },
  lugar: 'Quilmes',
  indicaciones: '',
})

export const copyDePrueba = (o: Partial<CopyPromo> = {}): CopyPromo => ({
  titular: 'Tu próxima aventura',
  hook: 'La TRK 502 te espera',
  copy: 'La TRK 502 en 999motos Quilmes, hoy $ 4.500.000. Escribinos por DM.',
  hashtags: ['#benelli', '#trk502', '#quilmes'],
  cta: 'Escribinos por DM',
  altText: 'Una moto Benelli TRK 502 en un estudio',
  ...o,
})

export const filaPromocion = (o: Partial<FilaPromocion> = {}): FilaPromocion => ({
  id: 'p1',
  organizacion_id: ORGANIZACION_PILOTO_ID,
  estado: 'borrador',
  revision: 1,
  marca_id: MARCAS[3]!.id,
  modelo: 'TRK 502',
  datos: datosDePrueba(),
  foto_id: 'f1',
  aspecto: '4:5',
  plantilla: null,
  fondo: null,
  analisis_id: null,
  textos_id: null,
  copy: null,
  copy_opcion: null,
  copy_editado: false,
  titular: null,
  fondo_descripcion: null,
  posicion_moto: 'centro',
  linea_extra: null,
  inspiracion_foto_id: null,
  escena_creativo_id: null,
  placa_ruta: null,
  placa_hash: null,
  tanda_id: null,
  creado_en: '2026-10-25T12:00:00+00:00',
  actualizado_en: '2026-10-25T12:00:00+00:00',
  ...o,
})
