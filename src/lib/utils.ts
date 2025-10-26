import { Day, Shift } from '../types'
import type { Override } from '../types'
import { DAYS } from '../constants'

export function uid(){ return Math.random().toString(36).slice(2,9) }
export function toMin(hhmm: string){ const [h,m]=hhmm.split(':').map(Number); return h*60+(m||0) }
export function minToHHMM(min: number){ const m=((min%1440)+1440)%1440; const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}` }
export const clamp = (val: number, min: number, max: number)=> Math.min(max, Math.max(min, val))

export type TimeFormat = '12h' | '24h'
export function formatMinutes(min: number, format: TimeFormat = '24h'){
  const normalized = ((min % 1440) + 1440) % 1440
  if(format === '12h'){
    const hours24 = Math.floor(normalized / 60)
    const minutes = normalized % 60
    const suffix = hours24 >= 12 ? 'PM' : 'AM'
    const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12
    return `${hour12}:${String(minutes).padStart(2,'0')} ${suffix}`
  }
  return minToHHMM(normalized)
}

export function isValidHHMM(v: string){ if(!/^\d{2}:\d{2}$/.test(v)) return false; const [h,m]=v.split(':').map(Number); if(h<0||h>24) return false; if(m<0||m>59) return false; if(h===24 && m!==0) return false; return true }
export function parseYMD(s: string){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d) }
export function addDays(d: Date, n: number){ const nd=new Date(d); nd.setDate(d.getDate()+n); return nd }
export function fmtYMD(d: Date){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function fmtNice(d: Date){ return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) }
// Compact date range without duplicated month/year
export function fmtDateRange(start: Date, end: Date){
  const sY = start.getFullYear();
  const eY = end.getFullYear();
  const sM = start.getMonth();
  const eM = end.getMonth();
  const sD = start.getDate();
  const eD = end.getDate();
  const sMon = start.toLocaleString(undefined, { month: 'short' });
  const eMon = end.toLocaleString(undefined, { month: 'short' });
  // Same exact day
  if(sY===eY && sM===eM && sD===eD){
    return fmtNice(start)
  }
  // Same month and year: Aug 25–31, 2025 (use thin spaces around the en dash for nicer kerning)
  if(sY===eY && sM===eM){
    const thin = '\u202F'
    return `${sMon} ${sD}${thin}–${thin}${eD}, ${sY}`
  }
  // Same year, different months: Aug 25 – Sep 2, 2025
  if(sY===eY){
    return `${sMon} ${sD} – ${eMon} ${eD}, ${sY}`
  }
  // Different years: Dec 31, 2025 – Jan 2, 2026
  return `${sMon} ${sD}, ${sY} – ${eMon} ${eD}, ${eY}`
}
// Sunday as the first day of the week
export function startOfWeek(d: Date){ const day=d.getDay(); const diff=0-day; const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m }
export function isoWeek(date: Date){ const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())); const dayNum=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); const week=Math.ceil((((d.getTime()-yearStart.getTime())/86400000)+1)/7); return {year:d.getUTCFullYear(),week} }
export function hourMarksForOffset(offset: number){ return Array.from({length:24},(_,i)=> (i+offset+24)%24) }
export function shiftKeyOf(person: string, day: Day, start: string, end: string){ return `${person}|${day}|${start}|${end}` }
export function shiftKey(s: {person:string;day:Day;start:string;end:string}){ return shiftKeyOf(s.person,s.day,s.start,s.end) }

// Get current time parts in a specific IANA timezone
export function nowInTZ(tzId: string){
  try{
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      hour: '2-digit', minute: '2-digit', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short',
    })
    const parts = fmt.formatToParts(new Date())
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p=>p.type===t)?.value || ''
    const h = parseInt(get('hour') || '0', 10)
    const m = parseInt(get('minute') || '0', 10)
    const y = parseInt(get('year') || '0', 10)
    const mo = parseInt(get('month') || '0', 10)
    const d = parseInt(get('day') || '0', 10)
    const wd = (get('weekday') || '').slice(0,3) // Sun, Mon, ...
    const minutes = (h*60 + m) % 1440
    const ymd = `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return { minutes, ymd, weekdayShort: wd, h, m, y, mo, d }
  }catch{
    const n=new Date();
    const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][n.getDay()]
    return { minutes: n.getHours()*60+n.getMinutes(), ymd: fmtYMD(n), weekdayShort: wd as any, h:n.getHours(), m:n.getMinutes(), y:n.getFullYear(), mo:n.getMonth()+1, d:n.getDate() }
  }
}

// Get short timezone abbreviation like PST/PDT/EST/EDT for a timezone id and date
export function tzAbbrev(tzId: string, date: Date = new Date()): string{
  try{
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      timeZoneName: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const parts = fmt.formatToParts(date)
    const abbr = parts.find(p=>p.type==='timeZoneName')?.value
    if(abbr && /[A-Z]{2,4}/.test(abbr)) return abbr
  }catch{}
  // Fallback: try offset-based GMT format
  try{
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tzId, timeZoneName: 'shortOffset' })
    const parts = fmt.formatToParts(date)
    const abbr = parts.find(p=>p.type==='timeZoneName')?.value
    if(abbr) return abbr
  }catch{}
  return 'UTC'
}

function mod(n:number,m:number){ return ((n % m) + m) % m }
function dayShift(day: Day, delta: number): Day{
  const i = DAYS.indexOf(day)
  const j = mod(i + delta, 7)
  return DAYS[j]
}

// Convert PT-based weekly shifts into viewer-TZ day segments
export function convertShiftsToTZ(shifts: Shift[], offsetHours: number): Shift[]{
  const res: Shift[] = []
  const offsetMin = offsetHours * 60
  for(const s of shifts){
    const sMinPT = toMin(s.start)
    const eMinPTRaw = s.end === '24:00' ? 1440 : toMin(s.end)
    // Determine duration; if endDay is explicit, use that to decide cross-midnight
    const crosses = typeof s.endDay === 'string' ? (s.endDay !== s.day) : (eMinPTRaw < sMinPT && s.end !== '24:00')
    const duration = s.end === '24:00'
      ? (1440 - sMinPT)
      : crosses ? ((1440 - sMinPT) + eMinPTRaw) : (eMinPTRaw - sMinPT)
    const eMinPT = sMinPT + duration
    const sMinLocal = sMinPT + offsetMin
    const eMinLocal = eMinPT + offsetMin
    const startDayDelta = Math.floor(sMinLocal / 1440)
    const endDayDelta   = Math.floor((eMinLocal-1) / 1440) // -1 to treat exact 24:00 as previous day end
    const startLocal = mod(sMinLocal, 1440)
    const endLocal   = mod(eMinLocal, 1440)

    const startDay = dayShift(s.day, startDayDelta)
    const endDay   = dayShift(s.day, endDayDelta)

    if(startDayDelta === endDayDelta){
      // Entirely within a single local day
      res.push({ ...s, day: startDay, start: minToHHMM(startLocal), end: eMinLocal - sMinLocal === 1440 ? '24:00' : minToHHMM(endLocal) })
    }else{
      // Spans midnight in local TZ: split into two segments
      res.push({ ...s, day: startDay, start: minToHHMM(startLocal), end: '24:00', endDay: endDay })
      res.push({ ...s, day: endDay,   start: '00:00', end: minToHHMM(endLocal), endDay: endDay })
    }
  }
  return res
}

// Get segments for a specific local day in viewer TZ
export function shiftsForDayInTZ(all: Shift[], targetDay: Day, offsetHours: number){
  const segs = convertShiftsToTZ(all, offsetHours)
  return segs.filter(s=>s.day===targetDay)
}

// External calendar segments stub type (taskId, absolute start/end within the shift window)
export type CalendarSegment = {
  person: string
  agentId?: string
  day: Day
  // Optional end day to allow posture segments that span midnight into the next day
  // If omitted or equal to `day`, the segment ends on the same local day.
  endDay?: Day
  start: string // HH:MM within day (local after convert)
  end: string   // HH:MM within day (local)
  taskId: string
}

export type CalendarSegmentSlice = {
  day: Day
  person: string
  agentId?: string
  taskId: string
  start: string
  end: string
}

export function expandCalendarSegments(calendarSegs: CalendarSegment[], offsetHours = 0): CalendarSegmentSlice[] {
  const out: CalendarSegmentSlice[] = []
  const offsetMin = offsetHours * 60
  const MINUTES_PER_DAY = 1440
  const WEEK_MIN = MINUTES_PER_DAY * 7

  for (const cs of calendarSegs) {
    if (!cs) continue
    const startIdx = DAYS.indexOf(cs.day)
    if (startIdx < 0) continue
    const startMin = toMin(cs.start)
    let startAbs = startIdx * MINUTES_PER_DAY + startMin

    const endIdxInit = typeof cs.endDay === 'string' ? DAYS.indexOf(cs.endDay as Day) : startIdx
    const endIdxBase = endIdxInit >= 0 ? endIdxInit : startIdx
    const rawEndMin = cs.end === '24:00' ? MINUTES_PER_DAY : toMin(cs.end)
    let endAbs = endIdxBase * MINUTES_PER_DAY + rawEndMin
    let guard = 0
    if (typeof cs.endDay === 'string') {
      while (endAbs <= startAbs && guard < 14) {
        endAbs += MINUTES_PER_DAY
        guard++
      }
    } else if (!(rawEndMin > startMin || cs.end === '24:00')) {
      endAbs += MINUTES_PER_DAY
    }
    if (guard >= 14) continue

    startAbs += offsetMin
    endAbs += offsetMin

    while (startAbs < 0) {
      startAbs += WEEK_MIN
      endAbs += WEEK_MIN
    }
    while (startAbs >= WEEK_MIN) {
      startAbs -= WEEK_MIN
      endAbs -= WEEK_MIN
    }
    while (endAbs <= startAbs) {
      endAbs += WEEK_MIN
    }

    let cursor = startAbs
    const finalEnd = endAbs
    guard = 0
    while (cursor < finalEnd && guard < 14) {
      const dayIdxRaw = Math.floor(cursor / MINUTES_PER_DAY)
      const dayIdx = mod(dayIdxRaw, 7)
      const dayStartAbs = Math.floor(cursor / MINUTES_PER_DAY) * MINUTES_PER_DAY
      const sliceStartAbs = cursor
      const sliceEndAbs = Math.min(finalEnd, dayStartAbs + MINUTES_PER_DAY)
      if (sliceEndAbs > sliceStartAbs) {
        const startLocal = mod(sliceStartAbs, MINUTES_PER_DAY)
        const endLocalRaw = mod(sliceEndAbs, MINUTES_PER_DAY)
        const endCoversDay = Math.abs(sliceEndAbs - (dayStartAbs + MINUTES_PER_DAY)) < 1e-6
        const startStr = minToHHMM(startLocal)
        const endStr = endCoversDay ? '24:00' : minToHHMM(endLocalRaw)
        out.push({
          day: DAYS[dayIdx],
          person: cs.person,
          agentId: cs.agentId,
          taskId: cs.taskId,
          start: startStr,
          end: endStr
        })
      }
      cursor = sliceEndAbs
      guard++
    }
  }
  return out
}

// Simple utilities to map between agent id and display name in the client
export function agentDisplayName(agents: { id?: string; firstName?: string; lastName?: string }[], agentId?: string, fallbackPerson?: string){
  if(agentId){
    const a = agents.find(a=> a.id && a.id===agentId)
    if(a){
      const nm = `${a.firstName||''} ${a.lastName||''}`.trim()
      if(nm) return nm
    }
  }
  return (fallbackPerson||'').trim()
}
export function agentIdByName(agents: { id?: string; firstName?: string; lastName?: string }[], name: string){
  const n = (name||'').trim().toLowerCase()
  if(!n) return undefined
  const match = agents.find(a=>`${a.firstName||''} ${a.lastName||''}`.trim().toLowerCase()===n)
  return match?.id
}

// Merge calendar-provided segments into local manual segments. Manual beats calendar on overlap; calendar fills gaps.
export function mergeSegments(
  shift: Shift,
  calendarSegs: { taskId: string; start: string; end: string }[]
): Shift['segments']{
  const sMin = toMin(shift.start)
  const eMinRaw = toMin(shift.end)
  const eMin = eMinRaw > sMin ? eMinRaw : 1440
  const dur = eMin - sMin
  const manual = shift.segments || []
  // Convert calendar absolute HH:MM into offsets
  const cal = calendarSegs.map(cs=>{
    const a = toMin(cs.start), b = toMin(cs.end)
    const st = Math.max(0, Math.min(dur, a - sMin))
    const en = Math.max(0, Math.min(dur, (b - sMin)))
    const dm = Math.max(0, en - st)
    return dm>0 ? { taskId: cs.taskId, startOffsetMin: st, durationMin: dm } : null
  }).filter(Boolean) as { taskId:string; startOffsetMin:number; durationMin:number }[]

  // Build an occupancy map in minutes to resolve overlaps (manual wins)
  const occ = new Array(dur).fill(null as null | { taskId:string; source:'manual'|'cal' })
  for(const seg of cal){
    for(let i=seg.startOffsetMin; i<seg.startOffsetMin+seg.durationMin && i<dur; i++){
      if(occ[i]==null) occ[i] = { taskId: seg.taskId, source: 'cal' }
    }
  }
  for(const seg of manual){
    for(let i=seg.startOffsetMin; i<seg.startOffsetMin+seg.durationMin && i<dur; i++){
      occ[i] = { taskId: seg.taskId, source: 'manual' }
    }
  }
  // Collapse back to segments
  const res: NonNullable<Shift['segments']> = []
  let i=0
  while(i<dur){
    const cell = occ[i]
    if(!cell){ i++; continue }
    const start=i; const taskId=cell.taskId
    let j=i+1
    while(j<dur && occ[j] && occ[j]!.taskId===taskId && occ[j]!.source===cell.source) j++
    res.push({ id: `${shift.id}-${taskId}-${start}`, shiftId: shift.id, taskId, startOffsetMin: start, durationMin: j-start })
    i=j
  }
  return res
}

export async function sha256Hex(s: string){
  try{
    if(typeof crypto !== 'undefined' && crypto.subtle){
      const enc = new TextEncoder().encode(s)
      const buf = await crypto.subtle.digest('SHA-256', enc)
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
    }
  }catch{}
  return 'plain:'+s
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const

function preSplitOvernightShifts(shifts: Shift[]): Shift[] {
  const pieces: Shift[] = []
  for(const s of shifts){
    const sMin = toMin(s.start)
    const eMinRaw = s.end==='24:00' ? 1440 : toMin(s.end)
    const crosses = typeof (s as any).endDay === 'string'
      ? ((s as any).endDay !== s.day)
      : (eMinRaw < sMin && s.end !== '24:00')
    if(crosses){
      const curIdx = DAY_NAMES.indexOf(s.day as any)
      const endDay = (s as any).endDay || DAY_NAMES[(curIdx + 1) % 7]
      pieces.push({ ...s, end: '24:00', endDay } as any)
      pieces.push({ ...s, day: endDay as any, start: '00:00', end: s.end, endDay } as any)
    }else{
      pieces.push(s)
    }
  }
  return pieces
}

function clampDayMinutes(n: number){
  return Math.max(0, Math.min(1440, n))
}

function formatMinutesAsHHMM(min: number){
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function makeShiftPiece(source: Shift, startMin: number, endMin: number, suffix: string): Shift {
  const endStr = endMin >= 1440 ? '24:00' : formatMinutesAsHHMM(endMin)
  const startStr = formatMinutesAsHHMM(startMin)
  const next: any = { ...source, id: `${source.id}${suffix}`, start: startStr, end: endStr }
  if(endStr !== '24:00' && next.endDay && next.endDay !== next.day){
    delete next.endDay
  }
  return next as Shift
}

function removeWindowFor(pieces: Shift[], person: string, day: string, rmStartMin: number, rmEndMin: number){
  const R0 = clampDayMinutes(rmStartMin)
  const R1 = clampDayMinutes(rmEndMin)
  if(!(R1 > R0)) return
  for(let i = pieces.length - 1; i >= 0; i--){
    const p = pieces[i]
    if(p.person !== person || p.day !== day) continue
    const pS = toMin(p.start)
    const pE = p.end === '24:00' ? 1440 : toMin(p.end)
    const L = Math.max(pS, R0)
    const U = Math.min(pE, R1)
    if(!(U > L)) continue
    const beforeLen = L - pS
    const afterLen = pE - U
    pieces.splice(i, 1)
    if(afterLen > 0){ pieces.splice(i, 0, makeShiftPiece(p, U, pE, '-b')) }
    if(beforeLen > 0){ pieces.splice(i, 0, makeShiftPiece(p, pS, L, '-a')) }
  }
}

function addOverridePiece(pieces: Shift[], params: {
  override: Override
  ymd: string
  day: Day
  start: string
  end: string
  endDay?: Day
  agents: { id?: string; firstName?: string; lastName?: string }[]
}): void{
  const { override: ov, ymd, day, start, end, endDay, agents } = params
  pieces.push({
    id: `ov:${ov.id}:${ymd}`,
    person: ov.person,
    agentId: agentIdByName(agents as any, ov.person),
    day,
    start,
    end,
    ...(endDay ? { endDay } : {})
  } as any)
}

function applyNoTimeOverride(pieces: Shift[], ov: Override, day: Day){
  let anchor: number | null = null
  for(const p of pieces){
    if(p.person === ov.person && p.day === day){
      const st = toMin(p.start)
      if(anchor == null || st < anchor) anchor = st
    }
  }
  if(anchor != null){
    removeWindowFor(pieces, ov.person, day, anchor, anchor + 480)
  }
}

function applyTimeOverride(pieces: Shift[], ov: Override, context: {
  current: Date
  nextDay: Day
  ymd: string
  day: Day
  agents: { id?: string; firstName?: string; lastName?: string }[]
  skipAddForYmd: Set<string>
}){
  const { current, nextDay, ymd, day, agents, skipAddForYmd } = context
  for(let i = pieces.length - 1; i >= 0; i--){
    const p = pieces[i]
    if(p.person === ov.person && p.day === day) pieces.splice(i,1)
  }
  if(skipAddForYmd.has(ymd)) return
  const start = ov.start as string
  const end = ov.end as string
  const startMin = toMin(start)
  const endMin = toMin(end)
  const overnight = (endMin <= startMin) && end !== '24:00'
  const endDay = overnight ? nextDay : undefined
  addOverridePiece(pieces, { override: ov, ymd, day, start, end, endDay, agents })
  if(overnight){
    const blackoutEnd = Math.max(endMin % 1440, 480)
    removeWindowFor(pieces, ov.person, nextDay, 0, blackoutEnd)
    const nextYmd = fmtYMD(addDays(current, 1))
    skipAddForYmd.add(nextYmd)
  }
}

function applyOverrideOccurrence(params: {
  start: Date
  end: Date
  ov: Override
  pieces: Shift[]
  week0: Date
  week6: Date
  agents: { id?: string; firstName?: string; lastName?: string }[]
  skipAddForYmd: Set<string>
}){
  const { start, end, ov, pieces, week0, week6, agents, skipAddForYmd } = params
  const inWeek = (ymd: string)=> ymd >= fmtYMD(week0) && ymd <= fmtYMD(week6)
  let cur = new Date(start)
  const last = new Date(end)
  while(cur <= last){
    const ymd = fmtYMD(cur)
    if(inWeek(ymd)){
      const day = DAY_NAMES[cur.getDay()] as Day
      if(ov.start && ov.end){
        const nextDay = DAY_NAMES[(cur.getDay()+1)%7] as Day
        applyTimeOverride(pieces, ov, { current: cur, nextDay, ymd, day, agents, skipAddForYmd })
      }else{
        applyNoTimeOverride(pieces, ov, day)
      }
    }
    cur = addDays(cur, 1)
  }
}

// Apply Overrides to a base list of weekly shifts for a given week window.
// Behavior matches ManageV2Page logic:
// - Time overrides (with start+end): remove the agent's shifts on covered days and add an override shift window.
//   If the window is overnight (end<=start and end!=='24:00'), set endDay to the next day and trim early next-day hours
//   from 00:00 up to max(endMin, 08:00).
// - No-time overrides: remove 8 hours starting at the earliest shift start on that day for the agent.
export function applyOverrides(
  baseShifts: Shift[],
  overrides: Override[] | undefined,
  weekStart: string,
  agents: { id?: string; firstName?: string; lastName?: string }[]
): Shift[]{
  const baseList = Array.isArray(baseShifts) ? baseShifts : []
  const pieces = preSplitOvernightShifts(baseList)
  const ovs: Override[] = Array.isArray(overrides) ? overrides : []
  if(ovs.length===0) return pieces
  const week0 = parseYMD(weekStart)
  const week6 = addDays(week0, 6)
  const skipAddForYmd = new Set<string>()
  for(const ov of ovs){
    let s = parseYMD(ov.startDate)
    let e = parseYMD(ov.endDate)
    if(ov.recurrence?.rule === 'weekly'){
      const until = ov.recurrence.until ? parseYMD(ov.recurrence.until) : null
      // fast-forward whole range by weeks until it overlaps the current week window
      let guard = 0
      while(e < week0 && guard < 200){
        s = addDays(s, 7)
        e = addDays(e, 7)
        guard++
        if(until && s > until) break
      }
      // Push each weekly occurrence that starts within or before the week and overlaps it
      while(s <= week6 && (!until || s <= until)){
        applyOverrideOccurrence({ start: s, end: e, ov, pieces, week0, week6, agents, skipAddForYmd })
        s = addDays(s, 7)
        e = addDays(e, 7)
      }
    } else {
      applyOverrideOccurrence({ start: s, end: e, ov, pieces, week0, week6, agents, skipAddForYmd })
    }
  }
  return pieces
}
