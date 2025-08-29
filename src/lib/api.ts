import type { PTO, Shift } from '../types'
import type { CalendarSegment } from './utils'

// Auth model: cookie session + CSRF only.
// - Dev: VITE_DEV_PROXY_BASE provides /api/login, /api/logout, /api/schedule with cookies and x-csrf-token.
// - Prod: expect a server with the same contract. Legacy password header is removed.
// Safety: even if VITE_DEV_PROXY_BASE leaks into a prod build, only use it on localhost.
const DEV_PROXY_RAW = import.meta.env.VITE_DEV_PROXY_BASE || '' // e.g., http://localhost:8787
const IS_LOCALHOST = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)$/.test(location.hostname)
const DEV_PROXY = IS_LOCALHOST ? DEV_PROXY_RAW : ''
const CLOUD_BASE = import.meta.env.VITE_SCHEDULE_API_BASE || 'https://team-schedule-api.bsteward.workers.dev'
const API_BASE = (DEV_PROXY || CLOUD_BASE).replace(/\/$/,'')

function getCsrfFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|; )csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// Unified login/logout that work in dev (proxy) and prod (Cloudflare/API)
export async function login(password: string){
  try{
    const r = await fetch(`${API_BASE}/api/login`,{
      method:'POST',
      headers:{ 'content-type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ password })
    })
    return { ok: r.ok, status: r.status }
  }catch{
    return { ok: false }
  }
}

export async function logout(){
  try{ await fetch(`${API_BASE}/api/logout`,{ method:'POST', credentials:'include' }) }catch{}
}

// Site-level gate for dev proxy
export async function devSiteLogin(password: string): Promise<{ ok: boolean; status?: number }>{
  if(!DEV_PROXY) return { ok: true }
  try{
    const r = await fetch(`${API_BASE}/api/login-site`,{
      method:'POST', headers:{ 'content-type':'application/json' }, credentials:'include', body: JSON.stringify({ password })
    })
    return { ok: r.ok, status: r.status }
  }catch{
    return { ok: false }
  }
}
export async function devSiteLogout(){
  if(!DEV_PROXY) return
  await fetch(`${API_BASE}/api/logout-site`,{ method:'POST', credentials:'include' })
}

export async function cloudGet(): Promise<{shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]} | null>{
  if(!API_BASE) return null
  try{
    // Dev/prod servers should expose /api/schedule (cookie session aware).
    // Fallback to legacy public GET endpoint only for read without credentials.
    const url = `${API_BASE}/api/schedule`
    const init: RequestInit = { credentials: 'include' }
    const r = await fetch(url, init)
    if(!r.ok) return null
    return await r.json()
  }catch{ return null }
}

export async function cloudPost(data: {shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; updatedAt: string}){
  if(!API_BASE) return false
  try{
    // Writes require cookie session + CSRF; legacy password header is removed.
    if(!DEV_PROXY){
      // Expect prod server to implement /api/schedule with cookies+CSRF.
      // If not present, fail fast with a clear warning.
      const csrf = getCsrfFromCookie()
      if(!csrf){ console.warn('[cloudPost] CSRF cookie missing; writes are disabled without an authenticated session.'); return false }
    }
    const url = `${API_BASE}/api/schedule`
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    const csrf = getCsrfFromCookie()
    if(csrf) headers['x-csrf-token'] = csrf
    const r = await fetch(url,{
      method:'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data)
    })
    return r.ok
  }catch{ return false }
}
