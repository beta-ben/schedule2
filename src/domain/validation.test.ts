import { describe, it, expect } from 'vitest'
import type { Shift } from '../types'
import { normalizeShiftsEndDay } from './validation'

const mk = (p: Partial<Shift>): Shift => ({ id: p.id||Math.random().toString(36).slice(2), person: p.person||'A', day: p.day||'Mon', start: p.start||'22:00', end: p.end||'02:00', endDay: (p as any).endDay })

describe('endDay normalization', () => {
  it('adds endDay for overnight', () => {
    const [s] = normalizeShiftsEndDay([mk({ day:'Mon', start:'22:00', end:'02:00' })])
    expect((s as any).endDay).toBe('Tue')
  })
  it('keeps same-day endDay for full-day shift', () => {
    const [s] = normalizeShiftsEndDay([mk({ day:'Wed', start:'00:00', end:'24:00' })])
    expect((s as any).endDay).toBe('Wed')
  })
})
