import type { PTO, Shift } from '../types'
import type { CalendarSegment } from './utils'

const API_BASE = import.meta.env.VITE_SCHEDULE_API_BASE || 'https://team-schedule-api.bsteward.workers.dev'
const WRITE_PASS = import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares'

export async function cloudGet(): Promise<{shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]} | null>{
  if(!API_BASE) return null
  try{
    const r = await fetch(API_BASE.replace(/\/$/,'')+'/v1/schedule')
    if(!r.ok) return null
    return await r.json()
  }catch{ return null }
}

export async function cloudPost(data: {shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; updatedAt: string}){
  if(!API_BASE) return false
  try{
    const r = await fetch(API_BASE.replace(/\/$/,'')+'/v1/schedule',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Admin-Password':WRITE_PASS},
      body: JSON.stringify(data)
    })
    return r.ok
  }catch{ return false }
}
