import { DAYS } from '../constants'
import type { Day, Shift, Task } from '../types'
import type { CalendarSegment } from '../lib/utils'
import { convertShiftsToTZ, toMin, minToHHMM, expandCalendarSegments, mergeSegments } from '../lib/utils'

export type ComplianceSeverity = 'hard' | 'soft'

export type ComplianceIssue = {
  rule: string
  severity: ComplianceSeverity
  person: string
  agentId?: string
  day?: Day
  shiftId?: string
  minutes?: number
  details?: string
}

export type LawsConfig = {
  // Base rule switches (defaults approximate CA baseline)
  dailyOtMin?: number // minutes, OT after this in a single day (default 480 = 8h)
  dailyDoubleMin?: number // minutes, double time after this (default 720 = 12h)
  weeklyOtMin?: number // minutes, OT after this in a week (default 2400 = 40h)
  requireDayOffPer7?: boolean // default true
  minRestBetween?: number // minutes (soft default 480 = 8h)
  minRestBetweenStrong?: number // minutes (soft overlay for FWW, 600 = 10h)
  requireMealAfter?: number // minutes (default 300 = 5h)
  requireSecondMealAfter?: number // minutes (default 600 = 10h)
  restBreakPerBlock?: number // minutes per block (default 10 per 240)
}

export const CA_BASELINE: Required<LawsConfig> = {
  dailyOtMin: 8*60,
  dailyDoubleMin: 12*60,
  weeklyOtMin: 40*60,
  requireDayOffPer7: true,
  minRestBetween: 8*60,
  minRestBetweenStrong: 10*60, // predictive scheduling overlay; still soft here
  requireMealAfter: 5*60,
  requireSecondMealAfter: 10*60,
  restBreakPerBlock: 10, // 10 minutes rest per 4 hours (240 minutes)
}

export type AgentLite = { id?: string; firstName?: string; lastName?: string; tzId?: string }

function agentName(a?: AgentLite){ return `${a?.firstName||''} ${a?.lastName||''}`.trim() }

function tzOffsetFor(agent?: AgentLite): number{
  // Offsets are defined relative to PT in constants (0..3)
  const id = (agent?.tzId||'America/Los_Angeles')
  if(id.includes('New_York')) return 3
  if(id.includes('Chicago')) return 2
  if(id.includes('Denver')) return 1
  return 0
}

function minutesBetween(aDay: Day, aEnd: string, bDay: Day, bStart: string){
  const aIdx = DAYS.indexOf(aDay as any)
  const bIdx = DAYS.indexOf(bDay as any)
  const aAbs = aIdx*1440 + toMin(aEnd)
  let bAbs = bIdx*1440 + toMin(bStart)
  if(bAbs <= aAbs) bAbs += 1440
  return bAbs - aAbs
}

function sumDayMinutes(shifts: Shift[]){
  let total = 0
  for(const s of shifts){
    const sMin = toMin(s.start)
    const eMin = s.end==='24:00' ? 1440 : toMin(s.end)
    const dur = eMin > sMin ? (eMin - sMin) : (1440 - sMin + eMin)
    total += dur
  }
  return total
}

export function computeComplianceWarnings(params: {
  weekStart: string
  shifts: Shift[]
  agents: AgentLite[]
  tasks?: Task[]
  calendarSegs?: CalendarSegment[]
  laws?: LawsConfig
  // When true, skip meal/rest-break within-shift rules but keep other checks.
  suppressMealBreaks?: boolean
}): { issues: ComplianceIssue[] }{
  const { shifts, agents, tasks, calendarSegs } = params
  const laws: Required<LawsConfig> = { ...CA_BASELINE, ...(params.laws||{}) }
  const issues: ComplianceIssue[] = []
  const suppressBreaks = !!params.suppressMealBreaks

  const byPerson = new Map<string,{ agent?: AgentLite; tzOffset:number; local: Shift[] }>()
  for(const a of agents){
    const name = agentName(a)
    if(!name) continue
    const tzOffset = tzOffsetFor(a)
    const local = convertShiftsToTZ(shifts, tzOffset).filter(s=> s.person===name)
    byPerson.set(name, { agent: a, tzOffset, local })
  }

  const calExpandedByOffset = new Map<number, CalendarSegment[]>()
  const getCalFor = (offset:number)=>{
    if(!calendarSegs || calendarSegs.length===0) return [] as CalendarSegment[]
    if(calExpandedByOffset.has(offset)) return calExpandedByOffset.get(offset)!
    const out = expandCalendarSegments(calendarSegs, offset)
    calExpandedByOffset.set(offset, out as any)
    return out as any
  }

  for(const [person, info] of byPerson){
    const localShifts = info.local
    const byDay = new Map<Day, Shift[]>()
    for(const d of DAYS){ byDay.set(d as Day, []) }
    for(const s of localShifts){ byDay.get(s.day as Day)!.push(s) }

    // Daily checks (minutes and breaks)
    for(const d of DAYS){
      const day = d as Day
      const list = byDay.get(day) || []
      const totalMin = sumDayMinutes(list)
      if(totalMin >= laws.dailyDoubleMin){ issues.push({ rule:'daily_doubletime_12h', severity:'hard', person, day, minutes: totalMin, details: `Worked ${minToHHMM(totalMin)} on ${day}` }) }
      else if(totalMin >= laws.dailyOtMin){ issues.push({ rule:'daily_ot_8h', severity:'soft', person, day, minutes: totalMin, details: `Worked ${minToHHMM(totalMin)} on ${day}` }) }

      // Breaks/Meals for each shift on that day
      for(const s of list){
        const sMin = toMin(s.start)
        const eMin = s.end==='24:00' ? 1440 : toMin(s.end)
        const dur = eMin > sMin ? (eMin - sMin) : (1440 - sMin + eMin)
        // Merge break segments (manual+calendar) to determine break coverage
        let breakMin = 0
        try{
          const cal = getCalFor(info.tzOffset)
            .filter((cs: any)=> cs.person===person && cs.day===s.day)
            .map((cs: any)=> ({ taskId: cs.taskId, start: cs.start, end: cs.end }))
          const merged = mergeSegments(s, cal) || []
          for(const seg of merged){
            const t = (tasks||[]).find(t=> t.id===seg.taskId)
            const isBreak = (t?.posture || '').toLowerCase()==='break' || (t?.name||'').toLowerCase().includes('break')
            if(isBreak) breakMin += seg.durationMin
          }
        }catch{}
        if(!suppressBreaks){
          // Meals
          if(dur > laws.requireMealAfter && breakMin < 30){
            issues.push({ rule:'meal_missing_30_after_5h', severity:'hard', person, day, shiftId: s.id, minutes: dur, details: `Shift ${s.start}–${s.end} missing ≥30m meal` })
          }
          if(dur > laws.requireSecondMealAfter && breakMin < 60){
            issues.push({ rule:'meal_second_missing_after_10h', severity:'hard', person, day, shiftId: s.id, minutes: dur, details: `Shift ${s.start}–${s.end} missing second ≥30m meal` })
          }
          // Rest: 10m per 4h block
          const neededRest = Math.floor(dur / 240) * (laws.restBreakPerBlock)
          const restShort = breakMin - Math.min(breakMin, (dur>laws.requireMealAfter?30:0) + (dur>laws.requireSecondMealAfter?30:0))
          if(neededRest > Math.max(0, restShort)){
            issues.push({ rule:'rest_break_short', severity:'soft', person, day, shiftId: s.id, minutes: dur, details: `Needs ${neededRest}m rest; scheduled ~${Math.max(0,restShort)}m` })
          }
        }
      }
    }

    // Weekly total
    const weekMin = Array.from(byDay.values()).reduce((acc,arr)=> acc+sumDayMinutes(arr), 0)
    if(weekMin > laws.weeklyOtMin){ issues.push({ rule:'weekly_ot_40h', severity:'hard', person, minutes: weekMin, details: `Worked ${minToHHMM(weekMin)} this week` }) }

    // 7th consecutive day (approx: within current week only)
    const workedFlags = DAYS.map(d=> (byDay.get(d as Day) || []).length>0 && sumDayMinutes(byDay.get(d as Day)!)>0 )
    const consecutive = workedFlags.reduce((max,cur,i,arr)=>{
      if(!cur) return Math.max(max, 0)
      // compute run length ending here
      let k=i; let len=0; while(k>=0 && arr[k]){ len++; k-- }
      return Math.max(max, len)
    }, 0)
    if(consecutive>=7){
      issues.push({ rule:'no_day_off_in_7', severity:'hard', person, details: 'No day off in 7-day span' })
      // Seventh day double time for >8h
      const day = DAYS[6] as Day
      const mins = sumDayMinutes(byDay.get(day) || [])
      if(mins > 8*60){ issues.push({ rule:'seventh_day_doubletime_after_8h', severity:'hard', person, day, minutes: mins }) }
    }

    // Rest between shifts (soft: <8h; predictive overlay: <10h)
    for(let i=0;i<7;i++){
      const day = DAYS[i] as Day
      const next = DAYS[(i+1)%7] as Day
      const cur = (byDay.get(day)||[]).slice().sort((a,b)=> toMin(a.end)-toMin(b.end))
      const nxt = (byDay.get(next)||[]).slice().sort((a,b)=> toMin(a.start)-toMin(b.start))
      if(cur.length===0 || nxt.length===0) continue
      const last = cur[cur.length-1]
      const first = nxt[0]
      const gap = minutesBetween(day, last.end, next, first.start)
      if(gap < laws.minRestBetween){ issues.push({ rule:'short_rest_between_shifts_8h', severity:'soft', person, day: next, minutes: gap, details: `Rest ${gap}m between shifts` }) }
      if(gap < laws.minRestBetweenStrong){ issues.push({ rule:'short_rest_pred_sched_10h', severity:'soft', person, day: next, minutes: gap, details: `Predictive scheduling: rest <10h` }) }
    }
  }

  return { issues }
}
