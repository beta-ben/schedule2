import { Day, Shift } from '../types'
import { DAYS } from '../constants'

export function uid(){ return Math.random().toString(36).slice(2,9) }
export function toMin(hhmm: string){ const [h,m]=hhmm.split(':').map(Number); return h*60+(m||0) }
export function minToHHMM(min: number){ const m=((min%1440)+1440)%1440; const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}` }
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
  day: Day
  start: string // HH:MM within day (local after convert)
  end: string   // HH:MM within day (local)
  taskId: string
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
