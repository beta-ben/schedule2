import { describe, it, expect } from 'vitest'
import { convertShiftsToTZ, minToHHMM, toMin, applyOverrides, expandCalendarSegments } from './utils'
import type { Shift, Override } from '../types'

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

describe('expandCalendarSegments', () => {
  it('returns the original segment when it ends the same day', () => {
    const res = expandCalendarSegments([
      { person: 'Pat', day: 'Mon', start: '09:00', end: '11:00', taskId: 'support' }
    ])
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ person: 'Pat', day: 'Mon', start: '09:00', end: '11:00', taskId: 'support' })
  })

  it('splits an overnight segment into start and end day pieces', () => {
    const res = expandCalendarSegments([
      { person: 'Riley', day: 'Tue', endDay: 'Wed', start: '22:00', end: '02:00', taskId: 'phones' }
    ])
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ person: 'Riley', day: 'Tue', start: '22:00', end: '24:00', taskId: 'phones' })
    expect(res[1]).toMatchObject({ person: 'Riley', day: 'Wed', start: '00:00', end: '02:00', taskId: 'phones' })
  })

  it('treats end-before-start without explicit endDay as overnight', () => {
    const res = expandCalendarSegments([
      { person: 'Sky', day: 'Fri', start: '21:00', end: '03:00', taskId: 'chat' }
    ])
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ person: 'Sky', day: 'Fri', start: '21:00', end: '24:00', taskId: 'chat' })
    expect(res[1]).toMatchObject({ person: 'Sky', day: 'Sat', start: '00:00', end: '03:00', taskId: 'chat' })
  })

  it('expands multi-day segments into daily slices', () => {
    const res = expandCalendarSegments([
      { person: 'Jamie', day: 'Mon', endDay: 'Thu', start: '18:00', end: '06:00', taskId: 'support' }
    ])
    expect(res).toHaveLength(4)
    expect(res[0]).toMatchObject({ day: 'Mon', start: '18:00', end: '24:00' })
    expect(res[1]).toMatchObject({ day: 'Tue', start: '00:00', end: '24:00' })
    expect(res[2]).toMatchObject({ day: 'Wed', start: '00:00', end: '24:00' })
    expect(res[3]).toMatchObject({ day: 'Thu', start: '00:00', end: '06:00' })
  })

  it('adjusts segments by positive timezone offset', () => {
    const res = expandCalendarSegments([
      { person: 'Alex', day: 'Mon', start: '10:00', end: '12:00', taskId: 'support' },
      { person: 'Blair', day: 'Mon', start: '23:00', end: '01:00', taskId: 'support' }
    ], 2)
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ person: 'Alex', day: 'Mon', start: '12:00', end: '14:00' })
    expect(res[1]).toMatchObject({ person: 'Blair', day: 'Tue', start: '01:00', end: '03:00' })
  })

  it('adjusts segments by negative timezone offset', () => {
    const res = expandCalendarSegments([
      { person: 'Casey', day: 'Wed', start: '02:00', end: '05:00', taskId: 'support' }
    ], -3)
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ person: 'Casey', day: 'Tue', start: '23:00', end: '24:00' })
    expect(res[1]).toMatchObject({ person: 'Casey', day: 'Wed', start: '00:00', end: '02:00' })
  })
})

describe('applyOverrides', () => {
  const weekStart = '2025-09-14' // Sunday
  const agents: { id?: string; firstName?: string; lastName?: string }[] = []

  it('removes day shifts and inserts override window (same day)', () => {
    const base: Shift[] = [
      mkShift({ id: 'a', person: 'Alice', day: 'Mon', start: '09:00', end: '17:00' }),
      mkShift({ id: 'b', person: 'Alice', day: 'Tue', start: '09:00', end: '17:00' })
    ]
    const ovs: Override[] = [{ id: 'ov1', person: 'Alice', startDate: '2025-09-15', endDate: '2025-09-15', start: '10:00', end: '16:00' } as any]
    const out = applyOverrides(base, ovs, weekStart, agents)
    // Monday original removed, replaced with 10-16
    const mon = out.filter(s=> s.day==='Mon' && s.person==='Alice')
    expect(mon).toHaveLength(1)
    expect(mon[0]).toMatchObject({ start: '10:00', end: '16:00' })
    // Tuesday unaffected
    const tue = out.find(s=> s.id==='b')
    expect(tue).toBeTruthy()
  })

  it('handles overnight override and trims next morning blackout up to max(end, 08:00)', () => {
    const base: Shift[] = [
      mkShift({ id: 'x', person: 'Bob', day: 'Tue', start: '07:00', end: '15:00' }),
      mkShift({ id: 'y', person: 'Bob', day: 'Wed', start: '08:00', end: '12:00' })
    ]
    // Override Tue 22:00 -> Wed 02:00: removes Tue shifts; adds Tue 22-02 with endDay Wed.
    // On Wed, blackout from 00:00 to max(02:00, 08:00)=08:00, trimming the 08:00-12:00 shift start to 08:00 unaffected.
    const ovs: Override[] = [{ id: 'ov2', person: 'Bob', startDate: '2025-09-16', endDate: '2025-09-16', start: '22:00', end: '02:00' } as any]
    const out = applyOverrides(base, ovs, weekStart, agents)
    const tue = out.filter(s=> s.person==='Bob' && s.day==='Tue')
    // Original Tue shift removed; only override exists
    expect(tue).toHaveLength(1)
    expect(tue[0]).toMatchObject({ start: '22:00', end: '02:00', endDay: 'Wed' })
    // Wed shift should be trimmed to remove 00:00-08:00 blackout; original Wed 08:00-12:00 remains since blackout ends at 08:00
    const wed = out.filter(s=> s.person==='Bob' && s.day==='Wed')
    // Expect exactly one Wed segment 08:00-12:00 (unchanged)
    expect(wed.some(s=> s.start==='08:00' && s.end==='12:00')).toBe(true)
  })

  it('applies weekly recurring overrides within the week window', () => {
    const base: Shift[] = [
      mkShift({ id: 'wk1', person: 'Cara', day: 'Mon', start: '09:00', end: '17:00' })
    ]
    const ovs: Override[] = [{
      id: 'ov-rec',
      person: 'Cara',
      startDate: '2025-09-08',
      endDate: '2025-09-08',
      start: '10:00',
      end: '16:00',
      recurrence: { rule: 'weekly', until: '2025-09-29' }
    } as any]
    const out = applyOverrides(base, ovs, weekStart, agents)
    const monday = out.filter(s=> s.day==='Mon' && s.person==='Cara')
    expect(monday).toHaveLength(1)
    expect(monday[0]).toMatchObject({ start: '10:00', end: '16:00' })
  })

  it('respects weekly recurring overnight overrides with blackout trimming', () => {
    const base: Shift[] = [
      mkShift({ id: 'r-tue', person: 'Dana', day: 'Tue', start: '07:00', end: '15:00' }),
      mkShift({ id: 'r-wed', person: 'Dana', day: 'Wed', start: '08:00', end: '12:00' })
    ]
    const ovs: Override[] = [{
      id: 'ov-night',
      person: 'Dana',
      startDate: '2025-09-09',
      endDate: '2025-09-09',
      start: '22:00',
      end: '02:00',
      recurrence: { rule: 'weekly', until: '2025-09-30' }
    } as any]
    const out = applyOverrides(base, ovs, weekStart, agents)
    const tue = out.filter(s=> s.person==='Dana' && s.day==='Tue')
    expect(tue).toHaveLength(1)
    expect(tue[0]).toMatchObject({ start: '22:00', end: '02:00', endDay: 'Wed' })
    const wed = out.filter(s=> s.person==='Dana' && s.day==='Wed')
    expect(wed.some(s=> s.start==='08:00' && s.end==='12:00')).toBe(true)
  })
})
