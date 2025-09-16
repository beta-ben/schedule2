import type { Shift, Day } from '../types'

// Normalize endDay similar to worker logic (subset) without server-only concerns.
export function normalizeShiftEndDay(s: Shift){
  const sMin = hhmmToMin(s.start)
  const eMin = hhmmToMin(s.end)
  if(Number.isNaN(sMin) || Number.isNaN(eMin)) return s
  if(s.end === '24:00'){
    if(!(s as any).endDay) (s as any).endDay = s.day
  }else if(eMin <= sMin){
    (s as any).endDay = (s as any).endDay || nextDay(s.day)
  }else{
    (s as any).endDay = (s as any).endDay || s.day
  }
  return s
}

export function normalizeShiftsEndDay(shifts: Shift[]): Shift[]{
  return shifts.map(s=> normalizeShiftEndDay({ ...s }))
}

// Lightweight client-side preflight overlap guard (optional usage);
// server still authoritative.
export function detectOverlap(shifts: Shift[]): { overlapping: [string,string][] }{
  const res: [string,string][] = []
  for(let i=0;i<shifts.length;i++){
    for(let j=i+1;j<shifts.length;j++){
      if(shifts[i].person !== shifts[j].person) continue
      if(shiftsCross(shifts[i], shifts[j])) res.push([shifts[i].id, shifts[j].id])
    }
  }
  return { overlapping: res }
}

function shiftsCross(a: Shift, b: Shift){
  const aSegs = segments(a)
  const bSegs = segments(b)
  for(const as of aSegs){ for(const bs of bSegs){ if(as.day===bs.day && as.s < bs.e && as.e > bs.s) return true } }
  return false
}
function segments(s: Shift){
  const sMin = hhmmToMin(s.start)
  const eRaw = s.end==='24:00'? 1440 : hhmmToMin(s.end)
  const crosses = (s as any).endDay ? ((s as any).endDay !== s.day) : (eRaw <= sMin && s.end!=='24:00')
  if(!crosses) return [{ day: s.day, s: sMin, e: eRaw }]
  return [ { day: s.day, s: sMin, e: 1440 }, { day: (s as any).endDay, s:0, e: eRaw } ]
}
function hhmmToMin(hhmm:string){ if(hhmm==='24:00') return 1440; const [h,m] = hhmm.split(':'); return (parseInt(h)||0)*60 + (parseInt(m)||0) }
function nextDay(d: Day){ const arr: Day[]=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; return arr[(arr.indexOf(d)+1)%7] }
