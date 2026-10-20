import type { PlanVista } from '@/lib/estratega/tipos'

/** Un plan válido para los tests de los componentes de /campanas. */
export const vistaDePrueba = (o: Partial<PlanVista> = {}): PlanVista => ({
  id: 'p1', raizId: 'r1', padreId: null, version: 3, origen: 'agente', estado: 'borrador',
  analisisId: 'a1', modelo: 'gpt-6-luna', costoUsd: 0.0021, creadoEn: '2026-10-20T10:00:00Z', aprobadoEn: null, desdeCache: false,
  brief: { analisisId: 'a1', objetivo: 'Vender', marcas: ['Zontes Quilmes'], producto: null, presupuestoTopeArs: 500000, desde: '2026-11-01', hasta: '2026-11-28', notas: null },
  plan: {
    objetivo: 'Subir consultas por mensaje',
    mensajeCentral: 'Probá la Zontes este mes',
    publico: { descripcion: 'Hombres de 25 a 40 de Quilmes', segmentos: [{ nombre: 'Primera moto', criterio: 'Interés en motos', porque: 'Comentan mucho' }] },
    marcas: ['Zontes Quilmes'],
    presupuesto: { montoArs: 300000, nivel: 'campania', nota: null },
    ventana: { desde: '2026-11-01', hasta: '2026-11-28' },
    canales: [
      { plataforma: 'instagram', formatos: ['reel'], porcentaje: 70, porque: 'Mejores vistas' },
      { plataforma: 'facebook', formatos: ['imagen'], porcentaje: 30, porque: 'Comentarios' },
    ],
    calendario: [{ semana: 1, eje: 'Lanzamiento', piezas: [{ plataforma: 'instagram', formato: 'reel', cantidad: 2, idea: 'Test ride' }] }],
    kpis: [{ metrica: 'Consultas', meta: 'Subir' }],
    fundamentos: ['"3000 vistas"'],
    supuestos: ['Hay stock'],
  },
  ...o,
})
