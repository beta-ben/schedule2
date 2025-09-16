import { describe, it, expect } from 'vitest'
import { minToHHMM, toMin, convertShiftsToTZ } from './utils'
import type { Shift } from '../types'

describe('time conversions', () => {
  it('round trips minutes', () => {
    for (const m of [0,1,59,60,61,1439,1440,-1,1500]) {
      const hhmm = minToHHMM(m)
      const back = toMin(hhmm)
      expect(minToHHMM(back)).toEqual(hhmm)
    }
  })
})

describe('convertShiftsToTZ', () => {
  const base: Shift[] = [
    { id:'s1', person:'A', day:'Mon', start:'22:00', end:'02:00', segments:[] },
    { id:'s2', person:'A', day:'Tue', start:'00:00', end:'24:00', segments:[] },
  ] as any
  it('handles positive offset crossing midnight', () => {
    const r = convertShiftsToTZ(base, +5)
    expect(r.length).toBeGreaterThan(2)
    for (const s of r) {
      expect(/\d{2}:\d{2}|24:00/.test(s.start)).toBeTruthy()
      expect(/\d{2}:\d{2}|24:00/.test(s.end)).toBeTruthy()
    }
  })
  it('handles negative offset crossing previous day', () => {
    const r = convertShiftsToTZ(base, -7)
    expect(r.length).toBeGreaterThan(2)
  })
})
import { describe, it, expect } from 'vitest'
import { convertShiftsToTZ, minToHHMM, toMin } from './utils'
import type { Shift } from '../types'

// Minimal stub of Shift type for tests (aligning with existing shape)
function mkShift(partial: Partial<Shift>): Shift {
  return {
    id: partial.id || 's1',
    person: partial.person || 'Alice',
    day: partial.day || 'Mon',
    start: partial.start || '09:00',
    end: partial.end || '17:00',
    endDay: partial.endDay,
    segments: partial.segments,
    agentId: partial.agentId
  }
}

describe('time helpers', () => {
  it('minToHHMM <-> toMin round trip for a set of sample minutes', () => {
    const samples = [0, 1, 59, 60, 90, 600, 720, 1023, 1439]
    for (const m of samples) {
      const hhmm = minToHHMM(m)
      const back = toMin(hhmm)
      expect(back).toBe(m)
    }
  })
})

describe('convertShiftsToTZ', () => {
  it('keeps a same-day shift intact (no split)', () => {
    const shifts = [mkShift({ id: 'a', day: 'Mon', start: '09:00', end: '17:00' })]
    const res = convertShiftsToTZ(shifts as any, 0)
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ day: 'Mon', start: '09:00', end: '17:00' })
  })

  it('splits a cross-midnight shift into two segments', () => {
    const shifts = [mkShift({ id: 'b', day: 'Mon', start: '22:00', end: '02:00' })]
    const res = convertShiftsToTZ(shifts as any, 0)
    expect(res).toHaveLength(2)
    const first = res[0]
    const second = res[1]
    expect(first).toMatchObject({ day: 'Mon', start: '22:00', end: '24:00' })
    expect(second).toMatchObject({ day: 'Tue', start: '00:00', end: '02:00' })
  })

  it('retains 24:00 end for a full-day shift', () => {
    const shifts = [mkShift({ id: 'c', day: 'Wed', start: '00:00', end: '24:00' })]
    const res = convertShiftsToTZ(shifts as any, 0)
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ day: 'Wed', start: '00:00', end: '24:00' })
  })

  it('applies timezone offset correctly (negative offset)', () => {
    const shifts = [mkShift({ id: 'd', day: 'Thu', start: '09:00', end: '17:00' })]
    // Offset -7 hours -> start should appear at 02:00 local
    const res = convertShiftsToTZ(shifts as any, -7)
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ start: '02:00', end: '10:00' })
  })

  it('splits when offset causes local midnight crossing', () => {
    const shifts = [mkShift({ id: 'e', day: 'Fri', start: '18:00', end: '23:00' })]
    // +8 hour offset -> 18:00 -> 02:00 next day local start, 23:00 -> 07:00 next day local end
    const res = convertShiftsToTZ(shifts as any, 8)
    // Because entire shift moves into next day without wrapping, should remain single segment on Sat
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ day: 'Sat', start: '02:00', end: '07:00' })
  })
})
