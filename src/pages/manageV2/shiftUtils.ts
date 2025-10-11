import type { Shift } from '../../types'

export function eqShift(a: Shift, b: Shift){
  return (
    a.id === b.id &&
    a.day === b.day &&
    a.start === b.start &&
    a.end === b.end &&
    (a as any).endDay === (b as any).endDay
  )
}

export function eqShifts(a: Shift[], b: Shift[]){
  if(a.length !== b.length) return false
  const map = new Map(a.map(s=> [s.id, s]))
  for(const s of b){
    const match = map.get(s.id)
    if(!match || !eqShift(match, s)) return false
  }
  return true
}
