import { piezasDePrueba } from '@/lib/contenidista/fixture'
import type { CreativoVista, PiezaImagenVista } from '@/lib/productor/pantalla'

export const creativoDePrueba = (o: Partial<CreativoVista> = {}): CreativoVista => ({
  id: 'c1',
  generacionId: 'g1',
  orden: 1,
  url: 'https://abc.supabase.co/storage/v1/object/sign/creativos/o/g1/1.jpg?token=T1',
  ancho: 896,
  alto: 1152,
  costoUsd: 0.03375,
  error: null,
  elegida: false,
  ...o,
})

export const piezaImagenDePrueba = (o: Partial<PiezaImagenVista> = {}): PiezaImagenVista => ({
  id: 'p1',
  raizId: 'r1',
  version: 1,
  aprobadoEn: '2026-10-26T10:00:00Z',
  pieza: piezasDePrueba()[1]!,
  aspecto: '4:5',
  generaciones: [],
  creativos: [],
  ...o,
})
