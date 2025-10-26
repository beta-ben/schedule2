import { DAYS } from '../constants'
import type { PTO, Shift } from '../types'
import { nowInTZ, toMin } from './utils'

type DayKey = (typeof DAYS)[number]

export function orderPeopleByFirstStart(shifts: Shift[]){
  if(shifts.length === 0) return []
  const firstStart = new Map<string, number>()
  for(const shift of shifts){
    const startMin = toMin(shift.start)
    const existing = firstStart.get(shift.person)
    if(existing == null || startMin < existing){
      firstStart.set(shift.person, startMin)
    }
  }
  return Array.from(firstStart.entries())
    .sort((a,b)=> a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([person])=> person)
}

export function computeSlimlineShifts(opts: {
  shifts: Shift[]
  dayKey: DayKey
  tzId: string
  pto: PTO[]
  now?: ReturnType<typeof nowInTZ>
}){
  const now = opts.now ?? nowInTZ(opts.tzId)
  const dayIdx = DAYS.indexOf(opts.dayKey as DayKey)
  const baseDayIndex = dayIdx >= 0 ? dayIdx : 0
  const nowAbs = baseDayIndex * 1440 + now.minutes
  const ymdNow = now.ymd

  const filtered = opts.shifts.filter(shift=>{
    if(opts.pto.some(p=> p.person === shift.person && p.startDate <= ymdNow && ymdNow <= p.endDate)){
      return false
    }
    const startDayIdx = DAYS.indexOf(shift.day as DayKey)
    const endDayRaw = (shift as any).endDay as DayKey | undefined
    const endDayIdxBase = endDayRaw ? DAYS.indexOf(endDayRaw) : startDayIdx
    const startAbs = (startDayIdx < 0 ? 0 : startDayIdx) * 1440 + toMin(shift.start)
    let endAbs = (endDayIdxBase < 0 ? (startDayIdx < 0 ? 0 : startDayIdx) : endDayIdxBase) * 1440 + (shift.end === '24:00' ? 1440 : toMin(shift.end))
    if(endAbs <= startAbs){
      endAbs += 1440
    }
    const isActive = nowAbs >= startAbs && nowAbs < endAbs
    const isOnDeck = startAbs > nowAbs && startAbs <= (nowAbs + 120)
    if(!(isActive || isOnDeck)){
      return false
    }
    return nowAbs <= (endAbs + 30)
  })

  return {
    shifts: filtered,
    people: orderPeopleByFirstStart(filtered),
    now
  }
}

