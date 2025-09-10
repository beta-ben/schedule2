import type { PTO, Shift } from '../types'
import type { CalendarSegment } from './utils'

// Auth model: cookie session + CSRF only.
// Dev uses same-origin API via Vite proxy to wrangler dev (port 8787).
// Prod points to VITE_SCHEDULE_API_BASE, validated in CI.
const FORCE = (import.meta.env.VITE_FORCE_API_BASE || 'no').toLowerCase() === 'yes'
const PROD = !!import.meta.env.PROD
const API_BASE = (
  (PROD || FORCE) ? (import.meta.env.VITE_SCHEDULE_API_BASE || '') : ''
).replace(/\/$/,'')
const API_PREFIX = (import.meta.env.VITE_SCHEDULE_API_PREFIX || '/api').replace(/\/$/,'')

// Tiny diagnostics helpers (read-only)
export function getApiBase(){ return API_BASE }
export function isUsingDevProxy(){ return false }
export function getApiPrefix(){ return API_PREFIX }

// In some deployments, CSRF cookie may be HttpOnly or scoped to a subdomain.
// We keep a memory copy captured from the login response body (when available).
let CSRF_TOKEN_MEM: string | null = null
function getCsrfFromCookieOnly(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|; )csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}
function getCsrfToken(): string | null {
  return CSRF_TOKEN_MEM || getCsrfFromCookieOnly()
}
export function hasCsrfCookie(){ return !!getCsrfFromCookieOnly() }
export function hasCsrfToken(){ return !!getCsrfToken() }
export function getCsrfDiagnostics(){
  return { cookie: !!getCsrfFromCookieOnly(), memory: !!CSRF_TOKEN_MEM, token: !!getCsrfToken() }
}

// Unified login/logout that work in dev (proxy) and prod (Cloudflare/API)
export async function login(password: string){
  try{
  const r = await fetch(`${API_BASE}${API_PREFIX}/login`,{
      method:'POST',
      headers:{ 'content-type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ password })
    })
    if(r.ok){
      try{ const j = await r.clone().json(); if(j && typeof j.csrf === 'string'){ CSRF_TOKEN_MEM = j.csrf } }catch{}
      // Best-effort: some servers also require a site session for reads/writes
      try{ await ensureSiteSession(password) }catch{}
  try{ window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: true } })) }catch{}
    }
    return { ok: r.ok, status: r.status }
  }catch{
    return { ok: false }
  }
}

export async function logout(){
  try{ await fetch(`${API_BASE}${API_PREFIX}/logout`,{ method:'POST', credentials:'include' }) }catch{}
  try{ CSRF_TOKEN_MEM = null; window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: false } })) }catch{}
}

// Site-level session (view gate)
export async function loginSite(password: string): Promise<{ ok: boolean; status?: number }>{
  try{
    const r = await fetch(`${API_BASE}${API_PREFIX}/login-site`,{
      method:'POST', headers:{ 'content-type':'application/json' }, credentials:'include', body: JSON.stringify({ password })
    })
    return { ok: r.ok, status: r.status }
  }catch{ return { ok: false } }
}
export async function logoutSite(){
  try{ await fetch(`${API_BASE}${API_PREFIX}/logout-site`,{ method:'POST', credentials:'include' }) }catch{}
}

export async function cloudGet(): Promise<{shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean }>; schemaVersion?: number} | null>{
  if(!API_BASE) return null
  try{
    // Server exposes /api/schedule (cookie session aware).
    const url = `${API_BASE}${API_PREFIX}/schedule`
    const init: RequestInit = { credentials: 'include' }
    const r = await fetch(url, init)
    if(!r.ok) return null
    return await r.json()
  }catch{ return null }
}

export type CloudPostResult = { ok: boolean; status?: number; error?: string; bodyText?: string }

export async function cloudPostDetailed(data: {shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean }>; updatedAt: string}): Promise<CloudPostResult>{
  if(!API_BASE) return { ok: false, error: 'no_api_base' }
  try{
    // Writes require cookie session + CSRF; legacy password header is removed.
  // Expect prod server to implement /api/schedule with cookies+CSRF.
  // If cookie isn't readable due to HttpOnly or subdomain scope, we also accept a token captured from login response.
  const csrf = getCsrfToken()
  if(!csrf){ console.warn('[cloudPost] CSRF token missing; writes are disabled without an authenticated session.'); return { ok:false, error:'missing_csrf' } }
  const url = `${API_BASE}${API_PREFIX}/schedule`
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
  if(csrf) headers['x-csrf-token'] = csrf
    const r = await fetch(url,{
      method:'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(data)
    })
    if(r.ok) return { ok: true, status: r.status }
    let err: string | undefined
    let bodyText: string | undefined
    try{
      const ct = r.headers.get('content-type')||''
      if(ct.includes('application/json')){
        const j = await r.json()
        err = (j && (j.error || j.code || j.message)) as any
        bodyText = JSON.stringify(j)
      }else{
        bodyText = await r.text()
      }
    }catch{}
    return { ok: false, status: r.status, error: err, bodyText }
  }catch{ return { ok: false } }
}

export async function cloudPost(data: {shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean }>; updatedAt: string}){
  const res = await cloudPostDetailed(data)
  return !!res.ok
}

// Agents-only write to avoid schedule conflicts when toggling hidden or renaming agents
export async function cloudPostAgents(agents: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean }>): Promise<boolean>{
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(csrf) headers['x-csrf-token'] = csrf
    const r = await fetch(`${API_BASE}${API_PREFIX}/agents`,{
      method:'POST', credentials:'include', headers, body: JSON.stringify({ agents })
    })
    return r.ok
  }catch{ return false }
}

// Try to establish a view/site session if the server requires it.
export async function ensureSiteSession(password?: string){
  try{
    // Quick probe: if schedule GET is allowed, nothing to do.
    const ping = await fetch(`${API_BASE}${API_PREFIX}/schedule`, { method:'GET', credentials:'include' })
    if(ping.ok) return
  }catch{}
  try{
    await fetch(`${API_BASE}${API_PREFIX}/login-site`, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ password: password||'' })
    })
  }catch{}
}
