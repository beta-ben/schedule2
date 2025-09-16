import { toMin } from './utils'
import type { Shift, Day } from '../types'

// Compute segment list for a shift (splitting at midnight if overnight)
export function shiftSegments(shift: Shift): Array<{ day: Day; startMin: number; endMin: number }> {
  const sMin = toMin(shift.start)
  const eRaw = shift.end === '24:00' ? 1440 : toMin(shift.end)
  const endDay = (shift as any).endDay as Day | undefined
  const crosses = typeof endDay === 'string' ? (endDay !== shift.day) : (eRaw <= sMin && shift.end !== '24:00')
  if (!crosses) {
    return [{ day: shift.day, startMin: sMin, endMin: eRaw }]
  }
  return [
    { day: shift.day, startMin: sMin, endMin: 1440 },
    { day: (endDay || nextDay(shift.day)), startMin: 0, endMin: eRaw }
  ]
}

// Create segments for an arbitrary prospective shift (not yet in list)
export function segmentsFor(day: Day, start: string, end: string, endDay?: Day){
  const sMin = toMin(start)
  const eRaw = end === '24:00' ? 1440 : toMin(end)
  const crosses = typeof endDay === 'string' ? (endDay !== day) : (eRaw <= sMin && end !== '24:00')
  if(!crosses){ return [{ day, startMin: sMin, endMin: eRaw }] }
  return [
    { day, startMin: sMin, endMin: 1440 },
    { day: (endDay || nextDay(day)), startMin: 0, endMin: eRaw }
  ]
}

export function shiftsOverlap(a: Shift, b: Shift): boolean {
  const aSegs = shiftSegments(a)
  const bSegs = shiftSegments(b)
  for(const as of aSegs){
    for(const bs of bSegs){
      if(as.day === bs.day && rangesOverlap(as.startMin, as.endMin, bs.startMin, bs.endMin)) return true
    }
  }
  return false
}

export function hasAnyOverlap(candidate: Shift, all: Shift[]): boolean {
  for(const s of all){ if(s.id !== candidate.id && shiftsOverlap(candidate, s)) return true }
  return false
}

// Person-specific conflict check used by quick-add panels
export function hasPersonShiftConflict(shifts: Shift[], person: string, day: Day, start: string, end: string, endDay?: Day){
  const newSegs = segmentsFor(day, start, end, endDay)
  for(const seg of newSegs){
    const existing = shifts.filter(x=> x.person===person && x.day===seg.day)
    for(const ex of existing){
      const parts = shiftSegments(ex)
      for(const p of parts){
        if(p.day === seg.day && rangesOverlap(seg.startMin, seg.endMin, p.startMin, p.endMin)) return true
      }
    }
  }
  return false
}

export function shiftDurationMinutes(s: Shift){
  const segs = shiftSegments(s)
  return segs.reduce((acc, seg)=> acc + (seg.endMin - seg.startMin), 0)
}

function rangesOverlap(aStart:number,aEnd:number,bStart:number,bEnd:number){
  return aStart < bEnd && aEnd > bStart
}
function nextDay(d: Day){
  const arr: Day[] = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  return arr[(arr.indexOf(d)+1)%7]
}
