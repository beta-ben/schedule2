import { Day } from '../types'

export function uid(){ return Math.random().toString(36).slice(2,9) }
export function toMin(hhmm: string){ const [h,m]=hhmm.split(':').map(Number); return h*60+(m||0) }
export function minToHHMM(min: number){ const m=((min%1440)+1440)%1440; const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}` }
export function isValidHHMM(v: string){ if(!/^\d{2}:\d{2}$/.test(v)) return false; const [h,m]=v.split(':').map(Number); if(h<0||h>24) return false; if(m<0||m>59) return false; if(h===24 && m!==0) return false; return true }
export function parseYMD(s: string){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d) }
export function addDays(d: Date, n: number){ const nd=new Date(d); nd.setDate(d.getDate()+n); return nd }
export function fmtYMD(d: Date){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function fmtNice(d: Date){ return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) }
export function startOfWeek(d: Date){ const day=d.getDay(); const diff=(day===0?-6:1)-day; const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m }
export function isoWeek(date: Date){ const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())); const dayNum=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-dayNum); const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); const week=Math.ceil((((d.getTime()-yearStart.getTime())/86400000)+1)/7); return {year:d.getUTCFullYear(),week} }
export function hourMarksForOffset(offset: number){ return Array.from({length:24},(_,i)=> (i+offset+24)%24) }
export function shiftKeyOf(person: string, day: Day, start: string, end: string){ return `${person}|${day}|${start}|${end}` }
export function shiftKey(s: {person:string;day:Day;start:string;end:string}){ return shiftKeyOf(s.person,s.day,s.start,s.end) }

export async function sha256Hex(s: string){
  try{
    // @ts-expect-error: crypto exists in browsers
    if(typeof crypto !== 'undefined' && crypto.subtle){
      const enc = new TextEncoder().encode(s)
      // @ts-expect-error: subtle present in browser
      const buf = await crypto.subtle.digest('SHA-256', enc)
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
    }
  }catch{}
  return 'plain:'+s
}
