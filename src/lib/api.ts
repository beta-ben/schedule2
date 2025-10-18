import type { PTO, Shift, Override } from '../types'
import type { StageDoc, StageKey, LiveDoc as StageLiveDoc } from '../domain/stage'
import type { CalendarSegment } from './utils'
import { mapAgentsToPayloads } from './agents'
import { isStageDebugEnabled, stageDebugLog } from './stage/debug'

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
const STAGE_UNSUPPORTED_STATUSES = new Set([404, 405, 501])
function isStageUnsupportedStatus(status?: number){ return typeof status === 'number' && STAGE_UNSUPPORTED_STATUSES.has(status) }
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
const ADMIN_CSRF_STORAGE_KEY = 'schedule.admin.csrf'
const ADMIN_SID_STORAGE_KEY = 'schedule.admin.sid'
let CSRF_TOKEN_MEM: string | null = null;
let ADMIN_SID_MEM: string | null = null;
(() => {
  if(typeof window === 'undefined') return
  try{
    const storage = window.localStorage
    if(!storage) return
    const storedCsrf = storage.getItem(ADMIN_CSRF_STORAGE_KEY)
    const storedSid = storage.getItem(ADMIN_SID_STORAGE_KEY)
    if(storedCsrf) CSRF_TOKEN_MEM = storedCsrf
    if(storedSid) ADMIN_SID_MEM = storedSid
  }catch{}
})()
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
export function hasAdminSid(){ return !!ADMIN_SID_MEM }
export function hasAdminSession(){ return hasCsrfToken() || hasAdminSid() }
export function getAdminSidDiagnostics(){
  return { memory: !!ADMIN_SID_MEM }
}

// Unified login/logout. In dev (DEV_MODE=1 on Worker) password succeeds immediately and returns CSRF.
export async function login(password: string){
  if(OFFLINE){
    try{ window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: true, offline: true } })) }catch{}
    return { ok: true, status: 200 }
  }
  const captureLoginBody = async(res: Response)=>{
    try{
      const text = await res.clone().text()
      if(!text) return null
      try{ return JSON.parse(text) as any }
      catch{
        console.warn('[login] response not JSON', { length: text.length })
        return null
      }
    }catch(err){
      console.warn('[login] failed to read response body', err)
      return null
    }
  }
  try{
    const r = await fetch(`${API_BASE}${API_PREFIX}/login`,{
      method:'POST',
      headers:{ 'content-type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ password })
    })
    if(r.ok){
      const payload = await captureLoginBody(r)
      if(payload && typeof payload.csrf === 'string'){
        CSRF_TOKEN_MEM = payload.csrf
        try{
          if(typeof window !== 'undefined'){
            const storage = window.localStorage
            if(storage) storage.setItem(ADMIN_CSRF_STORAGE_KEY, payload.csrf)
          }
        }catch{}
      }
      if(payload && typeof payload.sid === 'string'){
        ADMIN_SID_MEM = payload.sid
        try{
          if(typeof window !== 'undefined'){
            const storage = window.localStorage
            if(storage) storage.setItem(ADMIN_SID_STORAGE_KEY, payload.sid)
          }
        }catch{}
      }else if(!payload){
        console.warn('[login] missing response payload; unable to store admin session id')
      }else{
        console.warn('[login] admin session id missing in response payload', { keys: Object.keys(payload || {}) })
      }
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
  try{
    CSRF_TOKEN_MEM = null
    ADMIN_SID_MEM = null
    if(typeof window !== 'undefined'){
      try{
        const storage = window.localStorage
        if(storage){
          storage.removeItem(ADMIN_CSRF_STORAGE_KEY)
          storage.removeItem(ADMIN_SID_STORAGE_KEY)
        }
      }catch{}
    }
    window.dispatchEvent(new CustomEvent('schedule:auth', { detail: { loggedIn: false } }))
  }catch{}
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

function ensureStagePayload(doc: StageDoc): StageDoc{
  return {
    ...doc,
    shifts: Array.isArray(doc.shifts) ? doc.shifts : [],
    pto: Array.isArray(doc.pto) ? doc.pto : [],
    overrides: Array.isArray(doc.overrides) ? doc.overrides : [],
    calendarSegs: Array.isArray(doc.calendarSegs) ? doc.calendarSegs : [],
    agents: Array.isArray(doc.agents) ? doc.agents : undefined,
  }
}

function makeStageReadHeaders(): Record<string,string>{
  const headers: Record<string,string> = { accept: 'application/json' }
  const csrf = getCsrfToken()
  if(csrf) headers['x-csrf-token'] = csrf
  if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
  if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
  return headers
}

function makeStageWriteHeaders(opts?: { ifMatch?: string }): { headers: Record<string,string>; hasAuth: boolean }{
  const headers: Record<string,string> = { 'content-type': 'application/json' }
  const csrf = getCsrfToken()
  if(csrf) headers['x-csrf-token'] = csrf
  if(ADMIN_SID_MEM) headers['x-admin-sid'] = ADMIN_SID_MEM
  if(DEV_BEARER) headers['authorization'] = `Bearer ${DEV_BEARER}`
  const ifMatch = opts?.ifMatch
  if(ifMatch){
    headers['if-match'] = ifMatch
    headers['x-if-match'] = ifMatch
  }
  return { headers, hasAuth: !!csrf || !!DEV_BEARER }
}

async function readStageError(res: Response): Promise<string | undefined>{
  try{
    const ct = res.headers.get('content-type') || ''
    if(ct.includes('application/json')){
      const body = await res.json().catch(()=>null)
      if(body && typeof body.error === 'string') return body.error
      if(body && typeof body.message === 'string') return body.message
    }else{
      const text = await res.text().catch(()=>null)
      if(text) return text.slice(0, 2000)
    }
  }catch{}
  return undefined
}

async function safeStageJson<T = any>(res: Response): Promise<T | null>{
  try{
    if(res.status === 204 || res.status === 205) return null
    const contentLength = res.headers.get('content-length')
    if(contentLength && Number(contentLength) === 0) return null
    const text = await res.text()
    if(!text) return null
    return JSON.parse(text) as T
  }catch{
    return null
  }
}

function isUnauthorizedStatus(status?: number){
  return status === 401 || status === 403
}

function summarizeStageDocCounts(doc: StageDoc | StageLiveDoc | null | undefined){
  if(!doc) return null
  const asAny = doc as Record<string, unknown>
  const lengthOf = (value: unknown)=> Array.isArray(value) ? value.length : 0
  return {
    updatedAt: typeof asAny.updatedAt === 'string' ? asAny.updatedAt : null,
    shifts: lengthOf(asAny.shifts),
    pto: lengthOf(asAny.pto),
    overrides: lengthOf(asAny.overrides),
    calendarSegs: lengthOf(asAny.calendarSegs),
    agents: lengthOf(asAny.agents),
  }
}

export type StageGetResult = {
  ok: boolean
  status?: number
  stage?: StageDoc | null
  live?: StageLiveDoc | null
  unsupported?: boolean
  unauthorized?: boolean
}

export type StageSaveResult = {
  ok: boolean
  status?: number
  stage?: StageDoc
  updatedAt?: string
  conflict?: boolean
  unsupported?: boolean
  unauthorized?: boolean
  error?: string
}

export type StageResetResult = {
  ok: boolean
  status?: number
  stage?: StageDoc
  unsupported?: boolean
  unauthorized?: boolean
  error?: string
}

export type StagePublishResult = {
  ok: boolean
  status?: number
  conflict?: boolean
  live?: StageLiveDoc | null
  unsupported?: boolean
  unauthorized?: boolean
  error?: string
}

export type StageSnapshotResult = {
  ok: boolean
  status?: number
  id?: string
  unsupported?: boolean
  unauthorized?: boolean
  error?: string
}

export async function stageGet(key: StageKey): Promise<StageGetResult>{
  const debug = isStageDebugEnabled()
  if(debug){
    stageDebugLog('api:stageGet:request', { key })
  }
  if(OFFLINE){
    const result: StageGetResult = { ok:false, status: 503 }
    if(debug){
      stageDebugLog('api:stageGet:offline', result, 'warn')
    }
    return result
  }
  const csrfAvailable = hasCsrfToken() || !!DEV_BEARER
  if(!csrfAvailable){
    const result: StageGetResult = { ok:false, status: 401, unauthorized: true }
    if(debug){
      stageDebugLog('api:stageGet:missing_auth', result, 'warn')
    }
    return result
  }
  try{
    const params = new URLSearchParams()
    if(key.weekStart) params.set('weekStart', key.weekStart)
    if(key.tzId) params.set('tzId', key.tzId)
    const query = params.toString()
    const url = `${API_BASE}${API_PREFIX}/v2/stage${query ? `?${query}` : ''}`
    if(debug){
      stageDebugLog('api:stageGet:fetch', { url })
    }
    const res = await fetch(url, { method:'GET', credentials:'include', headers: makeStageReadHeaders() })
    if(isStageUnsupportedStatus(res.status)){
      const result: StageGetResult = { ok:false, status: res.status, unsupported: true }
      if(debug){
        stageDebugLog('api:stageGet:unsupported', result, 'warn')
      }
      return result
    }
    if(!res.ok){
      const result: StageGetResult = { ok:false, status: res.status, unauthorized: isUnauthorizedStatus(res.status) }
      if(debug){
        stageDebugLog('api:stageGet:http_error', { status: res.status, unauthorized: result.unauthorized }, 'warn')
      }
      return result
    }
    const json = await safeStageJson<Record<string, unknown>>(res)
    const stage = (json && typeof json.stage === 'object') ? json.stage as StageDoc : null
    const live = (json && typeof json.live === 'object') ? json.live as StageLiveDoc : null
    const result: StageGetResult = { ok:true, status: res.status, stage, live }
    if(debug){
      stageDebugLog('api:stageGet:success', {
        status: res.status,
        stage: summarizeStageDocCounts(stage),
        live: summarizeStageDocCounts(live)
      }, 'debug')
    }
    return result
  }catch(err){
    if(debug){
      stageDebugLog('api:stageGet:exception', { message: err instanceof Error ? err.message : String(err) }, 'error')
    }
    return { ok:false }
  }
}

export async function stageSave(doc: StageDoc, opts?: { ifMatch?: string }): Promise<StageSaveResult>{
  const debug = isStageDebugEnabled()
  if(debug){
    stageDebugLog('api:stageSave:request', {
      key: { weekStart: doc.weekStart, tzId: doc.tzId },
      ifMatch: opts?.ifMatch ?? null,
      counts: summarizeStageDocCounts(doc)
    })
  }
  if(OFFLINE){
    try{ localStorage.setItem(`schedule_stage_last_save.${doc.weekStart}.${doc.tzId}`, JSON.stringify(doc)) }catch{}
    const result: StageSaveResult = { ok:true, status: 200, stage: doc, updatedAt: doc.updatedAt }
    if(debug){
      stageDebugLog('api:stageSave:offline', result, 'warn')
    }
    return result
  }
  const { headers, hasAuth } = makeStageWriteHeaders({ ifMatch: opts?.ifMatch })
  if(!hasAuth){
    const result: StageSaveResult = { ok:false, error: 'missing_csrf' }
    if(debug){
      stageDebugLog('api:stageSave:missing_auth', result, 'warn')
    }
    return result
  }
  try{
    const payload = ensureStagePayload(doc)
    if(debug){
      stageDebugLog('api:stageSave:fetch', {
        url: `${API_BASE}${API_PREFIX}/v2/stage`,
        payloadCounts: summarizeStageDocCounts(payload)
      })
    }
    const res = await fetch(`${API_BASE}${API_PREFIX}/v2/stage`, {
      method:'PUT',
      credentials:'include',
      headers,
      body: JSON.stringify(payload)
    })
    if(isStageUnsupportedStatus(res.status)){
      const result: StageSaveResult = { ok:false, status: res.status, unsupported: true }
      if(debug){
        stageDebugLog('api:stageSave:unsupported', result, 'warn')
      }
      return result
    }
    if(res.status === 409 || res.status === 412){
      const result: StageSaveResult = { ok:false, status: res.status, conflict: true }
      if(debug){
        stageDebugLog('api:stageSave:conflict', result, 'warn')
      }
      return result
    }
    if(!res.ok){
      const result: StageSaveResult = { ok:false, status: res.status, unauthorized: isUnauthorizedStatus(res.status), error: await readStageError(res) }
      if(debug){
        stageDebugLog('api:stageSave:http_error', result, 'error')
      }
      return result
    }
    const json = await safeStageJson<Record<string, unknown>>(res)
    const stage = (json && typeof json.stage === 'object') ? json.stage as StageDoc : undefined
    const updatedAt = typeof json?.updatedAt === 'string' ? json.updatedAt : stage?.updatedAt
    const normalizedStage = stage || (updatedAt ? { ...payload, updatedAt } : payload)
    const result: StageSaveResult = { ok:true, status: res.status, stage: normalizedStage, updatedAt: updatedAt || payload.updatedAt }
    if(debug){
      stageDebugLog('api:stageSave:success', {
        status: res.status,
        updatedAt: result.updatedAt,
        counts: summarizeStageDocCounts(result.stage)
      }, 'debug')
    }
    return result
  }catch(err){
    if(debug){
      stageDebugLog('api:stageSave:exception', { message: err instanceof Error ? err.message : String(err) }, 'error')
    }
    return { ok:false }
  }
}

export async function stageReset(key: StageKey, live?: StageLiveDoc): Promise<StageResetResult>{
  const debug = isStageDebugEnabled()
  if(debug){
    stageDebugLog('api:stageReset:request', {
      key,
      live: summarizeStageDocCounts(live)
    })
  }
  if(OFFLINE){
    const now = new Date().toISOString()
    const fallback: StageDoc = {
      ...key,
      updatedAt: now,
      baseLiveUpdatedAt: live?.updatedAt,
      shifts: Array.isArray(live?.shifts) ? live.shifts : [],
      pto: Array.isArray(live?.pto) ? live.pto : [],
      overrides: Array.isArray(live?.overrides) ? live.overrides : [],
      calendarSegs: Array.isArray(live?.calendarSegs) ? live.calendarSegs : [],
      agents: Array.isArray(live?.agents) ? live.agents : undefined,
    }
    const result: StageResetResult = { ok:true, stage: fallback, status: 200 }
    if(debug){
      stageDebugLog('api:stageReset:offline', { counts: summarizeStageDocCounts(fallback) }, 'warn')
    }
    return result
  }
  const { headers, hasAuth } = makeStageWriteHeaders()
  if(!hasAuth){
    const result: StageResetResult = { ok:false, error: 'missing_csrf' }
    if(debug){
      stageDebugLog('api:stageReset:missing_auth', result, 'warn')
    }
    return result
  }
  try{
    const body: Record<string, unknown> = { key }
    if(live) body.live = live
    if(debug){
      stageDebugLog('api:stageReset:fetch', {
        url: `${API_BASE}${API_PREFIX}/v2/stage/reset`
      })
    }
    const res = await fetch(`${API_BASE}${API_PREFIX}/v2/stage/reset`, {
      method:'POST',
      credentials:'include',
      headers,
      body: JSON.stringify(body)
    })
    if(isStageUnsupportedStatus(res.status)){
      const result: StageResetResult = { ok:false, status: res.status, unsupported: true }
      if(debug){
        stageDebugLog('api:stageReset:unsupported', result, 'warn')
      }
      return result
    }
    if(!res.ok){
      const result: StageResetResult = { ok:false, status: res.status, unauthorized: isUnauthorizedStatus(res.status), error: await readStageError(res) }
      if(debug){
        stageDebugLog('api:stageReset:http_error', result, 'error')
      }
      return result
    }
    const json = await safeStageJson<Record<string, unknown>>(res)
    const stage = (json && typeof json.stage === 'object') ? json.stage as StageDoc : undefined
    const result: StageResetResult = { ok:true, status: res.status, stage }
    if(debug){
      stageDebugLog('api:stageReset:success', {
        status: res.status,
        stage: summarizeStageDocCounts(stage)
      }, 'debug')
    }
    return result
  }catch(err){
    if(debug){
      stageDebugLog('api:stageReset:exception', { message: err instanceof Error ? err.message : String(err) }, 'error')
    }
    return { ok:false }
  }
}

export async function stagePublish(doc: StageDoc, live?: StageLiveDoc, opts?: { force?: boolean; ifMatch?: string }): Promise<StagePublishResult>{
  const debug = isStageDebugEnabled()
  if(debug){
    stageDebugLog('api:stagePublish:request', {
      key: { weekStart: doc.weekStart, tzId: doc.tzId },
      ifMatch: opts?.ifMatch ?? null,
      force: !!opts?.force,
      stage: summarizeStageDocCounts(doc),
      live: summarizeStageDocCounts(live)
    })
  }
  if(OFFLINE){
    const result: StagePublishResult = { ok:true, status: 200, live: live ?? null }
    if(debug){
      stageDebugLog('api:stagePublish:offline', { live: summarizeStageDocCounts(live) }, 'warn')
    }
    return result
  }
  const { headers, hasAuth } = makeStageWriteHeaders({ ifMatch: opts?.ifMatch })
  if(!hasAuth){
    const result: StagePublishResult = { ok:false, error: 'missing_csrf' }
    if(debug){
      stageDebugLog('api:stagePublish:missing_auth', result, 'warn')
    }
    return result
  }
  try{
    const body: Record<string, unknown> = { stage: ensureStagePayload(doc) }
    if(live) body.live = live
    if(opts?.force) body.force = true
    if(debug){
      stageDebugLog('api:stagePublish:fetch', {
        url: `${API_BASE}${API_PREFIX}/v2/stage/publish`
      })
    }
    const res = await fetch(`${API_BASE}${API_PREFIX}/v2/stage/publish`, {
      method:'POST',
      credentials:'include',
      headers,
      body: JSON.stringify(body)
    })
    if(isStageUnsupportedStatus(res.status)){
      const result: StagePublishResult = { ok:false, status: res.status, unsupported: true }
      if(debug){
        stageDebugLog('api:stagePublish:unsupported', result, 'warn')
      }
      return result
    }
    if(res.status === 409 || res.status === 412){
      const result: StagePublishResult = { ok:false, status: res.status, conflict: true }
      if(debug){
        stageDebugLog('api:stagePublish:conflict', result, 'warn')
      }
      return result
    }
    if(!res.ok){
      const result: StagePublishResult = { ok:false, status: res.status, unauthorized: isUnauthorizedStatus(res.status), error: await readStageError(res) }
      if(debug){
        stageDebugLog('api:stagePublish:http_error', result, 'error')
      }
      return result
    }
    const json = await safeStageJson<Record<string, unknown>>(res)
    const liveDoc = (json && typeof json.live === 'object') ? json.live as StageLiveDoc : undefined
    const result: StagePublishResult = { ok:true, status: res.status, live: liveDoc ?? null }
    if(debug){
      stageDebugLog('api:stagePublish:success', {
        status: res.status,
        live: summarizeStageDocCounts(result.live)
      }, 'debug')
    }
    return result
  }catch(err){
    if(debug){
      stageDebugLog('api:stagePublish:exception', { message: err instanceof Error ? err.message : String(err) }, 'error')
    }
    return { ok:false }
  }
}

export async function stageSnapshot(doc: StageDoc, title?: string): Promise<StageSnapshotResult>{
  const debug = isStageDebugEnabled()
  if(debug){
    stageDebugLog('api:stageSnapshot:request', {
      key: { weekStart: doc.weekStart, tzId: doc.tzId },
      title: title ?? null,
      counts: summarizeStageDocCounts(doc)
    })
  }
  if(OFFLINE){
    const result: StageSnapshotResult = { ok:true, status: 200, id: 'offline' }
    if(debug){
      stageDebugLog('api:stageSnapshot:offline', result, 'warn')
    }
    return result
  }
  const { headers, hasAuth } = makeStageWriteHeaders()
  if(!hasAuth){
    const result: StageSnapshotResult = { ok:false, error: 'missing_csrf' }
    if(debug){
      stageDebugLog('api:stageSnapshot:missing_auth', result, 'warn')
    }
    return result
  }
  try{
    const body: Record<string, unknown> = { stage: ensureStagePayload(doc) }
    if(title) body.title = title
    if(debug){
      stageDebugLog('api:stageSnapshot:fetch', {
        url: `${API_BASE}${API_PREFIX}/v2/stage/snapshot`
      })
    }
    const res = await fetch(`${API_BASE}${API_PREFIX}/v2/stage/snapshot`, {
      method:'POST',
      credentials:'include',
      headers,
      body: JSON.stringify(body)
    })
    if(isStageUnsupportedStatus(res.status)){
      const result: StageSnapshotResult = { ok:false, status: res.status, unsupported: true }
      if(debug){
        stageDebugLog('api:stageSnapshot:unsupported', result, 'warn')
      }
      return result
    }
    if(!res.ok){
      const result: StageSnapshotResult = { ok:false, status: res.status, unauthorized: isUnauthorizedStatus(res.status), error: await readStageError(res) }
      if(debug){
        stageDebugLog('api:stageSnapshot:http_error', result, 'error')
      }
      return result
    }
    const json = await safeStageJson<Record<string, unknown>>(res)
    const id = typeof json?.id === 'string' ? json.id : undefined
    const result: StageSnapshotResult = { ok:true, status: res.status, id }
    if(debug){
      stageDebugLog('api:stageSnapshot:success', result, 'debug')
    }
    return result
  }catch(err){
    if(debug){
      stageDebugLog('api:stageSnapshot:exception', { message: err instanceof Error ? err.message : String(err) }, 'error')
    }
    return { ok:false }
  }
}

// Proposals API was removed upstream; provide benign fallbacks so legacy UI still compiles.
export async function cloudCreateProposal(_: {
  title: string
  weekStart: string
  tzId: string
  shifts: Shift[]
  pto: PTO[]
  overrides: Override[]
  calendarSegs?: CalendarSegment[]
  agents?: ReturnType<typeof mapAgentsToPayloads>
  baseUpdatedAt?: string
}): Promise<{ ok: boolean; status?: number; id?: string }> {
  return { ok: false, status: 501 }
}

export async function cloudListProposals(): Promise<{ ok: boolean; status?: number; proposals?: any[] }> {
  return { ok: false, status: 501, proposals: [] }
}

export async function cloudGetProposal(_: string): Promise<{ ok: boolean; status?: number; proposal?: any }> {
  return { ok: false, status: 501 }
}

export async function cloudUpdateProposal(_: string, __: Record<string, unknown>): Promise<{ ok: boolean; status?: number }> {
  return { ok: false, status: 501 }
}

export async function cloudMergeProposal(_: string, __?: { force?: boolean }): Promise<{ ok: boolean; status?: number; error?: string }> {
  return { ok: false, status: 501, error: 'proposals_disabled' }
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
