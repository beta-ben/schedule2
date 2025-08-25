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
    // Support overnight (single record where end < start): treat end as next-day time
    const duration = s.end === '24:00'
      ? (1440 - sMinPT)
      : (eMinPTRaw >= sMinPT ? (eMinPTRaw - sMinPT) : ((1440 - sMinPT) + eMinPTRaw))
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
      res.push({ ...s, day: startDay, start: minToHHMM(startLocal), end: '24:00' })
      res.push({ ...s, day: endDay,   start: '00:00', end: minToHHMM(endLocal) })
    }
  }
  return res
}

// Get segments for a specific local day in viewer TZ
export function shiftsForDayInTZ(all: Shift[], targetDay: Day, offsetHours: number){
  const segs = convertShiftsToTZ(all, offsetHours)
  return segs.filter(s=>s.day===targetDay)
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
