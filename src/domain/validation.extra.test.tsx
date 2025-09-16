import { describe, it, expect } from 'vitest'
import type { Shift } from '../types'
import { detectOverlap, normalizeShiftEndDay } from './validation'

const mk = (p: Partial<Shift>): Shift => ({ id: p.id||Math.random().toString(36).slice(2), person: p.person||'A', day: p.day||'Mon', start: p.start||'09:00', end: p.end||'17:00', endDay: (p as any).endDay })

describe('detectOverlap', () => {
  it('no overlap for back-to-back same person shifts', () => {
    const a = mk({ start:'09:00', end:'10:00' })
    const b = mk({ start:'10:00', end:'11:00' })
    const { overlapping } = detectOverlap([a,b])
    expect(overlapping).toHaveLength(0)
  })
  it('finds overlap for nested shift', () => {
    const a = mk({ start:'09:00', end:'12:00' })
    const b = mk({ start:'10:00', end:'11:00' })
    const { overlapping } = detectOverlap([a,b])
    expect(overlapping.length).toBe(1)
  })
  it('treats overnight segments consistently', () => {
    const a = normalizeShiftEndDay(mk({ day:'Mon', start:'22:00', end:'02:00' }))
    const b = mk({ day:'Tue', start:'01:30', end:'03:00' })
    const { overlapping } = detectOverlap([a,b])
    expect(overlapping.length).toBe(1)
  })
})