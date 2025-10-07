import type { PTO, Shift, Override } from '../types'
import type { CalendarSegment } from './utils'
import { mapAgentsToPayloads } from './agents'

const OFFLINE = (import.meta.env as any).VITE_DISABLE_API === '1'
const FORCE = ((import.meta.env as any).VITE_FORCE_API_BASE || 'no').toLowerCase() === 'yes'
const PROD = !!import.meta.env.PROD
const DEV_BEARER = (!PROD && !OFFLINE ? (import.meta.env.VITE_DEV_BEARER_TOKEN || '') : '') as string
const API_BASE = (
  OFFLINE
    ? ''
    : ((PROD || FORCE) ? (import.meta.env.VITE_SCHEDULE_API_BASE || '') : '')
).replace(/\/$/, '')
const API_PREFIX = (import.meta.env.VITE_SCHEDULE_API_PREFIX || '/api').replace(/\/$/, '')
const USING_DEV_PROXY = !PROD && !FORCE && !OFFLINE && API_BASE === ''

const V2_UNSUPPORTED_STATUSES = new Set([404, 405, 501])
let V2_SUPPORT: boolean | null = USING_DEV_PROXY ? true : null
let V2_SUPPORT_PROMISE: Promise<boolean> | null = null

function markV2Unsupported(){ V2_SUPPORT = false }
function isV2UnsupportedStatus(status?: number){ return typeof status === 'number' && V2_UNSUPPORTED_STATUSES.has(status) }
async function ensureV2Support(): Promise<boolean>{
  if(OFFLINE) return false
  if(V2_SUPPORT === true) return true
  if(V2_SUPPORT === false) return false
  if(V2_SUPPORT_PROMISE) return V2_SUPPORT_PROMISE
  // Relative paths still work when API_BASE is empty (dev proxy)
  const probeUrl = `${API_BASE}${API_PREFIX}/v2/agents?__probe=1`
  V2_SUPPORT_PROMISE = (async()=>{
    try{
      const res = await fetch(probeUrl, { method:'GET', credentials:'include', headers:{ 'accept':'application/json' } })
      if(isV2UnsupportedStatus(res.status)) V2_SUPPORT = false
      else V2_SUPPORT = true
    }catch{
      V2_SUPPORT = false
    }finally{
      V2_SUPPORT_PROMISE = null
    }
    return V2_SUPPORT === true
  })()
  return V2_SUPPORT_PROMISE
}

// Minimal diagnostics
export function getApiBase(){ return API_BASE }
export function isOfflineMode(){ return OFFLINE }
export function isUsingDevProxy(){ return USING_DEV_PROXY }
export function getApiPrefix(){ return API_PREFIX }

// In some deployments, CSRF cookie may be HttpOnly or scoped to a subdomain.
// We keep a memory copy captured from the login response body (when available).
let CSRF_TOKEN_MEM: string | null = null
let ADMIN_SID_MEM: string | null = null
function getCsrfFromCookieOnly(): string | null {
  if(typeof document === 'undefined') return null
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

// Unified login/logout. In dev (DEV_MODE=1 on Worker) password succeeds immediately and returns CSRF.
export async function login(password: string){
  if(OFFLINE){
    try{ window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: true, offline: true } })) }catch{}
    return { ok: true, status: 200 }
  }
  try{
    const r = await fetch(`${API_BASE}${API_PREFIX}/login`,{
      method:'POST',
      headers:{ 'content-type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ password })
    })
    if(r.ok){
      try{
        const j = await r.clone().json();
        if(j && typeof j.csrf === 'string'){ CSRF_TOKEN_MEM = j.csrf }
        if(j && typeof j.sid === 'string'){ ADMIN_SID_MEM = j.sid }
      }catch{}
      try{ window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: true } })) }catch{}
    }
    return { ok: r.ok, status: r.status }
  }catch{
    return { ok: false }
  }
}

export async function logout(){
  if(OFFLINE){
    try{ window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: false, offline: true } })) }catch{}
    return
  }
  try{ await fetch(`${API_BASE}${API_PREFIX}/logout`,{ method:'POST', credentials:'include' }) }catch{}
  try{ CSRF_TOKEN_MEM = null; window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: false } })) }catch{}
}

// Magic link login helpers
export async function requestMagicLink(
  email: string,
  role: 'admin'|'site' = 'admin'
): Promise<{ ok: boolean; link?: string }>{
  try{
    const r = await fetch(`${API_BASE}${API_PREFIX}/login-magic/request`,{
      method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ email, role })
    })
    const ok = r.ok
    let link: string | undefined
    try{ const j = await r.clone().json(); if(j && typeof j.link==='string') link = j.link }catch{}
    return { ok, link }
  }catch{ return { ok:false } }
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

export async function cloudGet(): Promise<{shifts: Shift[]; pto: PTO[]; overrides?: Override[]; calendarSegs?: CalendarSegment[]; agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: string | null }>; schemaVersion?: number} | null>{
  if(OFFLINE){
    return { shifts: [], pto: [], overrides: [], calendarSegs: [], agents: [], schemaVersion: 2 }
  }
  try{
    const url = `${API_BASE}${API_PREFIX}/schedule`
    const init: RequestInit = { credentials: 'include' }
    const r = await fetch(url, init)
    if(!r.ok) return null
    return await r.json()
  }catch{ return null }
}

export type CloudPostResult = { ok: boolean; status?: number; error?: string; bodyText?: string }

export async function cloudPostDetailed(data: {shifts: Shift[]; pto: PTO[]; overrides?: Override[]; calendarSegs?: CalendarSegment[]; agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: string | null }>; updatedAt: string}): Promise<CloudPostResult>{
  if(OFFLINE){
    try{ localStorage.setItem('schedule_offline_last_post', JSON.stringify(data)) }catch{}
    return { ok: true, status: 200 }
  }
  try{
    const csrf = getCsrfToken()
    if(!csrf && !DEV_BEARER){
      console.warn('[cloudPost] CSRF token missing; writes are disabled without an authenticated session.')
      return { ok:false, error:'missing_csrf' }
    }
    const url = `${API_BASE}${API_PREFIX}/schedule`
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(csrf) headers['x-csrf-token'] = csrf
    if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
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

export async function cloudPost(data: {shifts: Shift[]; pto: PTO[]; overrides?: Override[]; calendarSegs?: CalendarSegment[]; agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: string | null }>; updatedAt: string}){
  const res = await cloudPostDetailed(data)
  return !!res.ok
}

export async function cloudPostAgents(agents: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: string | null }>): Promise<boolean>{
  if(OFFLINE){
    try{ localStorage.setItem('schedule_offline_agents', JSON.stringify(agents)) }catch{}
    return true
  }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(csrf) headers['x-csrf-token'] = csrf
    if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`

    const normalizedAgents = mapAgentsToPayloads(agents)

    const useV2 = await ensureV2Support()
    if(useV2){
      try{
        const r2 = await fetch(`${API_BASE}${API_PREFIX}/v2/agents`,{
          method:'PATCH',
          credentials:'include',
          headers,
          body: JSON.stringify({ agents: normalizedAgents })
        })
        if(r2.ok) return true
        if(isV2UnsupportedStatus(r2.status)) markV2Unsupported()
      }catch{
        markV2Unsupported()
      }
    }
    const r = await fetch(`${API_BASE}${API_PREFIX}/agents`,{
      method:'POST', credentials:'include', headers, body: JSON.stringify({ agents: normalizedAgents })
    })
    return r.ok
  }catch{ return false }
}

export async function cloudPostShiftsBatch(input: { upserts?: Array<{ id: string; person: string; agentId?: string; day: string; start: string; end: string; endDay?: string }>; deletes?: string[] }): Promise<boolean>{
  if(OFFLINE) return true
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(csrf) headers['x-csrf-token'] = csrf
    if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    if(await ensureV2Support()){
      try{
        const r = await fetch(`${API_BASE}${API_PREFIX}/v2/shifts/batch`, {
          method:'POST', credentials:'include', headers, body: JSON.stringify({ upserts: input.upserts||[], deletes: input.deletes||[] })
        })
        if(r.ok) return true
        if(isV2UnsupportedStatus(r.status)) markV2Unsupported()
      }catch{
        markV2Unsupported()
      }
    }
    return false
  }catch{ return false }
}

export async function ensureSiteSession(password?: string){
  if(OFFLINE) return true
  try{
    const ping = await fetch(`${API_BASE}${API_PREFIX}/schedule`, { method:'GET', credentials:'include' })
    if(ping.ok) return true
  }catch{}
  if(password && password.length >= 3){
    try{
      const r = await fetch(`${API_BASE}${API_PREFIX}/login-site`, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        credentials:'include',
        body: JSON.stringify({ password })
      })
      if(r.ok) return true
    }catch{}
  }
  return false
}

export async function cloudCreateProposal(input: {
  title?: string;
  description?: string;
  weekStart?: string;
  tzId?: string;
  baseUpdatedAt?: string;
  shifts?: Shift[];
  pto?: PTO[];
  overrides?: Override[];
  calendarSegs?: CalendarSegment[];
  agents?: Array<{ id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean; isSupervisor?: boolean; supervisorId?: string|null; notes?: string; meetingCohort?: string | null }>;
}): Promise<{ ok: boolean; id?: string; status?: number; error?: string }>{
  if(!(await ensureV2Support())) return { ok:false, status: 404, error: 'unsupported' }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(csrf) headers['x-csrf-token'] = csrf
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const r = await fetch(`${API_BASE}${API_PREFIX}/v2/proposals`,{
      method:'POST', credentials:'include', headers, body: JSON.stringify(input)
    })
    let id: string | undefined
    try{ const j = await r.clone().json(); if(j && typeof j.id==='string') id = j.id }catch{}
    if(r.ok) return { ok:true, id, status:r.status }
    if(isV2UnsupportedStatus(r.status)) markV2Unsupported()
    return { ok:false, status:r.status }
  }catch{
    markV2Unsupported()
    return { ok:false }
  }
}

export async function cloudListProposals(): Promise<{ ok: boolean; proposals?: Array<{ id:string; title?:string; status:string; createdAt:number; updatedAt:number; weekStart?:string; tzId?:string }>; status?: number }>{
  if(!(await ensureV2Support())) return { ok:false, status: 404 }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = {}
    if(csrf) headers['x-csrf-token'] = csrf
    if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const r = await fetch(`${API_BASE}${API_PREFIX}/v2/proposals`,{ method:'GET', credentials:'include', headers })
    if(!r.ok){
      if(isV2UnsupportedStatus(r.status)) markV2Unsupported()
      return { ok:false, status: r.status }
    }
    const j = await r.json()
    return { ok:true, proposals: Array.isArray(j?.proposals) ? j.proposals : [] }
  }catch{
    markV2Unsupported()
    return { ok:false }
  }
}

export async function cloudGetProposal(id: string): Promise<{ ok: boolean; proposal?: any; status?: number }>{
  if(!(await ensureV2Support())) return { ok:false, status: 404 }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = {}
    if(csrf) headers['x-csrf-token'] = csrf
    if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const r = await fetch(`${API_BASE}${API_PREFIX}/v2/proposals/${encodeURIComponent(id)}`,{ method:'GET', credentials:'include', headers })
    if(!r.ok){
      if(isV2UnsupportedStatus(r.status)) markV2Unsupported()
      return { ok:false, status: r.status }
    }
    const j = await r.json()
    return { ok:true, proposal: j?.proposal }
  }catch{
    markV2Unsupported()
    return { ok:false }
  }
}

export async function cloudUpdateProposal(id: string, input: { status?: 'open'|'in_review'|'approved'|'rejected'|'closed'|'merged'; title?: string; description?: string }): Promise<{ ok: boolean; status?: number }>{
  if(!(await ensureV2Support())) return { ok:false, status: 404 }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = { 'Content-Type':'application/json' }
    if(csrf) headers['x-csrf-token'] = csrf
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const r = await fetch(`${API_BASE}${API_PREFIX}/v2/proposals/${encodeURIComponent(id)}`,{
      method:'PATCH', credentials:'include', headers, body: JSON.stringify(input||{})
    })
    return { ok: r.ok, status: r.status }
  }catch{ return { ok:false } }
}

export async function cloudMergeProposal(id: string, opts?: { force?: boolean }): Promise<{ ok: boolean; updatedAt?: string; status?: number; error?: string }>{
  if(!(await ensureV2Support())) return { ok:false, status: 404 }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = {}
    if(csrf) headers['x-csrf-token'] = csrf
    if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const url = new URL(`${API_BASE}${API_PREFIX}/v2/proposals/${encodeURIComponent(id)}/merge`, window.location.origin)
    if(opts?.force) url.searchParams.set('force','1')
    const r = await fetch(url.toString(),{ method:'POST', credentials:'include', headers })
    let updatedAt: string | undefined
    let error: string | undefined
    try{
      const j = await r.clone().json()
      if(j && typeof j.updatedAt==='string') updatedAt = j.updatedAt
      if(j && typeof j.error==='string') error = j.error
    }catch{}
    return { ok: r.ok, status: r.status, updatedAt, error }
  }catch{ return { ok:false } }
}

export type ZoomConnectionSummary = {
  id: string
  zoomUserId: string
  email: string | null
  displayName: string | null
  accountId: string | null
  scope: string | null
  tokenType: string | null
  expiresAt: number | null
  refreshExpiresAt: number | null
  lastSyncedAt: number | null
  hasSyncCursor: boolean
  createdAt: number | null
  updatedAt: number | null
}

export async function getZoomAuthorizeUrl(): Promise<{ ok: boolean; url?: string; scope?: string; status?: number }>{
  if(OFFLINE) return { ok:false, status: 503 }
  try{
    const r = await fetch(`${API_BASE}${API_PREFIX}/zoom/oauth/url`,{ method:'GET', credentials:'include' })
    if(!r.ok) return { ok:false, status: r.status }
    const j = await r.json().catch(()=>null)
    const url = typeof j?.url === 'string' ? j.url : undefined
    const scope = typeof j?.scope === 'string' ? j.scope : undefined
    return { ok:true, url, scope }
  }catch{
    return { ok:false }
  }
}

export async function getZoomConnections(): Promise<{ ok: boolean; connections: ZoomConnectionSummary[]; status?: number }>{
  if(OFFLINE) return { ok:false, connections: [], status: 503 }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = {}
    if(csrf) headers['x-csrf-token'] = csrf
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const r = await fetch(`${API_BASE}${API_PREFIX}/zoom/connections`,{ method:'GET', credentials:'include', headers })
    if(!r.ok) return { ok:false, connections: [], status: r.status }
    const j = await r.json().catch(()=>null)
    const items = Array.isArray(j?.connections) ? j.connections as any[] : []
    const toNum = (value: unknown): number | null => {
      if(typeof value === 'number') return Number.isFinite(value) ? value : null
      if(typeof value === 'string'){
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }
    const normalized: ZoomConnectionSummary[] = items.map(item=>{
      return {
        id: String(item?.id ?? ''),
        zoomUserId: String(item?.zoomUserId ?? ''),
        email: typeof item?.email === 'string' ? item.email : null,
        displayName: typeof item?.displayName === 'string' ? item.displayName : null,
        accountId: typeof item?.accountId === 'string' ? item.accountId : null,
        scope: typeof item?.scope === 'string' ? item.scope : null,
        tokenType: typeof item?.tokenType === 'string' ? item.tokenType : null,
        expiresAt: toNum(item?.expiresAt),
        refreshExpiresAt: toNum(item?.refreshExpiresAt),
        lastSyncedAt: toNum(item?.lastSyncedAt),
        hasSyncCursor: item?.hasSyncCursor === true,
        createdAt: toNum(item?.createdAt),
        updatedAt: toNum(item?.updatedAt),
      }
    })
    return { ok:true, connections: normalized }
  }catch{
    return { ok:false, connections: [] }
  }
}

export async function deleteZoomConnection(id: string): Promise<{ ok: boolean; status?: number }>{
  if(OFFLINE) return { ok:false, status: 503 }
  if(!id) return { ok:false, status: 400 }
  try{
    const csrf = getCsrfToken()
    const headers: Record<string,string> = {}
    if(csrf) headers['x-csrf-token'] = csrf
    if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
    const r = await fetch(`${API_BASE}${API_PREFIX}/zoom/connections/${encodeURIComponent(id)}`,{ method:'DELETE', credentials:'include', headers })
    if(!r.ok) return { ok:false, status: r.status }
    return { ok:true }
  }catch{
    return { ok:false }
  }
}
