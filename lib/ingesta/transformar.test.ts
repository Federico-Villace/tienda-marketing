import { describe, it, expect } from 'vitest'
import { contarResultados, filaCampania, filaMetrica, rangoDias } from './transformar'

const ctx = { organizacionId: 'org-1', cuentaId: 'cta-1' }

describe('contarResultados', () => {
  it('suma conversaciones de mensajes iniciadas y leads', () => {
    expect(
      contarResultados([
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' },
        { action_type: 'lead', value: '3' },
        { action_type: 'link_click', value: '400' },
      ]),
    ).toBe(15)
  })

  it('no cuenta dos veces los subtipos de lead', () => {
    expect(
      contarResultados([
        { action_type: 'lead', value: '5' },
        { action_type: 'onsite_conversion.lead_grouped', value: '5' },
        { action_type: 'onsite_web_lead', value: '5' },
      ]),
    ).toBe(5)
  })

  it('sin actions es cero', () => {
    expect(contarResultados(undefined)).toBe(0)
  })
})

describe('filaCampania', () => {
  it('mapea la campaña de Meta a la tabla y guarda el crudo', () => {
    const c = {
      id: '120',
      name: 'Tráfico web',
      objective: 'OUTCOME_TRAFFIC',
      effective_status: 'ACTIVE',
      start_time: '2026-09-01T10:00:00-0300',
    }
    expect(filaCampania(c, ctx)).toEqual({
      organizacion_id: 'org-1',
      cuenta_id: 'cta-1',
      meta_campaign_id: '120',
      nombre: 'Tráfico web',
      objetivo: 'OUTCOME_TRAFFIC',
      estado: 'ACTIVE',
      inicio: '2026-09-01T10:00:00-0300',
      fin: null,
      crudo: c,
    })
  })
})

describe('filaMetrica', () => {
  it('convierte los strings de Meta a números y usa date_start como fecha', () => {
    const i = {
      campaign_id: '120',
      date_start: '2026-10-01',
      date_stop: '2026-10-01',
      spend: '1500.75',
      impressions: '20000',
      clicks: '350',
      ctr: '1.75',
      cpc: '4.2879',
      actions: [{ action_type: 'lead', value: '2' }],
    }
    expect(filaMetrica(i, 'camp-uuid')).toEqual({
      campania_id: 'camp-uuid',
      fecha: '2026-10-01',
      gasto: 1500.75,
      impresiones: 20000,
      clics: 350,
      ctr: 1.75,
      cpc: 4.2879,
      conversiones: 2,
      crudo: i,
    })
  })

  it('un día sin clics deja cpc en null en vez de inventar un cero', () => {
    const f = filaMetrica({ campaign_id: '1', date_start: '2026-10-01', spend: '0', impressions: '10' }, 'c')
    expect(f).toMatchObject({ gasto: 0, impresiones: 10, clics: 0, cpc: null, ctr: null })
  })
})

describe('rangoDias', () => {
  it('cuenta los días en hora de Buenos Aires, hoy incluido', () => {
    // 13-oct 01:00 UTC = 12-oct 22:00 en Buenos Aires
    expect(rangoDias(new Date('2026-10-13T01:00:00Z'), 90)).toEqual({
      desde: '2026-07-15',
      hasta: '2026-10-12',
    })
  })
})
