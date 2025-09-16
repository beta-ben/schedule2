import { describe, it, expect } from 'vitest'
import type { Shift } from '../types'
import { hasAnyOverlap, shiftsOverlap, shiftSegments, hasPersonShiftConflict } from './overlap'

const mk = (p: Partial<Shift>): Shift => ({ id: p.id||Math.random().toString(36).slice(2), person: p.person||'A', day: p.day||'Mon', start: p.start||'09:00', end: p.end||'17:00', endDay: (p as any).endDay })

describe('overlap utilities', () => {
  it('detects non-overlapping distinct shifts', () => {
    const a = mk({ start:'09:00', end:'10:00' })
    const b = mk({ start:'10:00', end:'11:00' })
    expect(shiftsOverlap(a,b)).toBe(false)
  })
  it('detects simple overlap', () => {
    const a = mk({ start:'09:00', end:'11:00' })
    const b = mk({ start:'10:30', end:'12:00' })
    expect(shiftsOverlap(a,b)).toBe(true)
  })
  it('splits overnight shift into two segments', () => {
    const a = mk({ day:'Mon', start:'22:00', end:'02:00', endDay:'Tue' as any })
    const segs = shiftSegments(a)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ day:'Mon', startMin:1320, endMin:1440 })
    expect(segs[1]).toMatchObject({ day:'Tue', startMin:0, endMin:120 })
  })
  it('handles 24:00 end without producing overnight segment', () => {
    const a = mk({ start:'00:00', end:'24:00' })
    expect(shiftSegments(a)).toHaveLength(1)
  })
  it('person conflict helper matches legacy logic', () => {
    const existing = [mk({ person:'Alice', day:'Wed', start:'09:00', end:'11:00' })]
    const conflict = hasPersonShiftConflict(existing as any, 'Alice', 'Wed' as any, '10:00', '12:00')
    expect(conflict).toBe(true)
  })
  it('hasAnyOverlap excludes self by id', () => {
    const s = mk({ id:'x', start:'09:00', end:'10:00' })
    expect(hasAnyOverlap(s, [s])).toBe(false)
  })
})
