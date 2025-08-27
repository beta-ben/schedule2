import type { PTO, Shift } from '../types'
import type { CalendarSegment } from './utils'

// If a dev auth proxy is configured, prefer it; otherwise fall back to the public API.
const DEV_PROXY = import.meta.env.VITE_DEV_PROXY_BASE || '' // e.g., http://localhost:8787
const API_BASE = (DEV_PROXY || import.meta.env.VITE_SCHEDULE_API_BASE || 'https://team-schedule-api.bsteward.workers.dev').replace(/\/$/,'')

function getCsrfFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|; )csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// Login for dev proxy only (no-op for remote API)
export async function devLogin(password: string){
  if(!DEV_PROXY) return true
  const r = await fetch(`${API_BASE}/api/login`,{
    method:'POST',
    headers:{ 'content-type':'application/json' },
    credentials:'include',
    body: JSON.stringify({ password })
  })
  return r.ok
}

export async function devLogout(){
  if(!DEV_PROXY) return
  await fetch(`${API_BASE}/api/logout`,{ method:'POST', credentials:'include' })
}

export async function cloudGet(): Promise<{shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]} | null>{
  if(!API_BASE) return null
  try{
    const url = DEV_PROXY ? `${API_BASE}/api/schedule` : `${API_BASE}/v1/schedule`
    const r = await fetch(url, {
      credentials: DEV_PROXY ? 'include' : 'same-origin',
      headers: DEV_PROXY ? { 'x-csrf-token': getCsrfFromCookie() || '' } : undefined,
    })
    if(!r.ok) return null
    return await r.json()
  }catch{ return null }
}

export async function cloudPost(data: {shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; updatedAt: string}){
  if(!API_BASE) return false
  try{
    const url = DEV_PROXY ? `${API_BASE}/api/schedule` : `${API_BASE}/v1/schedule`
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(DEV_PROXY){
      headers['x-csrf-token'] = getCsrfFromCookie() || ''
    }else{
      const writePass = import.meta.env.VITE_SCHEDULE_WRITE_PASSWORD || 'betacares'
      headers['X-Admin-Password'] = writePass
    }
    const r = await fetch(url,{
      method:'POST',
      headers,
      credentials: DEV_PROXY ? 'include' as const : 'same-origin',
      body: JSON.stringify(data)
    })
    return r.ok
  }catch{ return false }
}
