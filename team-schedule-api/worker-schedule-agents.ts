/// <reference types="@cloudflare/workers-types" />
/*
  Cloudflare Worker: Schedule API with agents support (hidden flag persists)

  Endpoints:
    - POST /api/login        : admin login (sets sid + csrf cookies)
    - POST /api/logout       : admin logout
    - POST /api/login-site   : view login (sets site_sid cookie)
    - POST /api/logout-site  : view logout
    - GET  /api/schedule     : read schedule (requires site session if REQUIRE_SITE_SESSION=true)
    - POST /api/schedule     : write schedule (requires admin session + CSRF)

  Storage:
    - KV namespace binding: SCHEDULE_KV (stores the schedule doc and sessions)
      * schedule doc key: env.DATA_KEY or 'schedule.json'
      * sessions: 'admin:<sid>' and 'site:<sid>' with TTL (8 hours by default)

  Env bindings required (wrangler.toml):
    - SCHEDULE_KV = { binding = "SCHEDULE_KV", id = "<kv id>" }
    - ADMIN_PASSWORD = "<admin password>"
    - SITE_PASSWORD = "<view password>"
    - (optional) ALLOWED_ORIGINS = "https://teamschedule.cc,https://your.dev"
    - (optional) COOKIE_DOMAIN = ".teamschedule.cc" (omit for dev)
    - (optional) COOKIE_SECURE = "true" | "false" (default true)
    - (optional) COOKIE_SAMESITE = "Lax" | "None" | "Strict" (default Lax)
    - (optional) REQUIRE_SITE_SESSION = "true" | "false" (default true)
    - (optional) DATA_KEY = "schedule.json"

  Notes:
    - This mirrors the dev-server behavior in this repo, including referential integrity
      between person and agentId, endDay normalization, and conflict checks via updatedAt.
    - If your Worker already has auth/session logic, you can splice in:
      - readDoc/putDoc
      - normalizeAndValidate()
      - GET/POST schedule handlers
*/

// Workers types are provided via @cloudflare/workers-types and Wrangler

export interface Env {
  SCHEDULE_KV: KVNamespace
  ADMIN_PASSWORD: string
  SITE_PASSWORD: string
  ALLOWED_ORIGINS?: string
  CORS_ORIGINS?: string
  COOKIE_DOMAIN?: string
  COOKIE_SECURE?: string
  COOKIE_SAMESITE?: string
  REQUIRE_SITE_SESSION?: string
  DATA_KEY?: string
}

// Types
export type Day = 'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'
export type Shift = { id: string; person: string; agentId?: string; day: Day; start: string; end: string; endDay?: Day; segments?: Array<{ id: string; shiftId: string; taskId: string; startOffsetMin: number; durationMin: number; notes?: string }> }
export type PTO = { id: string; person: string; agentId?: string; startDate: string; endDate: string; notes?: string }
export type CalendarSegment = { person: string; agentId?: string; day: Day; start: string; end: string; taskId: string }
export type Agent = { id: string; firstName: string; lastName: string; tzId?: string; hidden?: boolean }
export type ScheduleDoc = { schemaVersion: number; agents?: Agent[]; shifts: Shift[]; pto: PTO[]; calendarSegs?: CalendarSegment[]; updatedAt?: string; agentsIndex?: Record<string,string> }

// Router
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // CORS
    const cors = corsHeaders(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const url = new URL(req.url)
    const path = url.pathname.replace(/\/$/,'')

    try {
      if (req.method === 'POST' && path === '/api/login') return loginAdmin(req, env, cors)
      if (req.method === 'POST' && path === '/api/logout') return logoutAdmin(req, env, cors)
      if (req.method === 'POST' && path === '/api/login-site') return loginSite(req, env, cors)
      if (req.method === 'POST' && path === '/api/logout-site') return logoutSite(req, env, cors)

  if (req.method === 'GET' && path === '/api/schedule') return getSchedule(req, env, cors)
  if (req.method === 'POST' && path === '/api/schedule') return postSchedule(req, env, cors)
  // Agents-only endpoints to persist metadata (like hidden) without schedule conflicts
  if (req.method === 'GET' && path === '/api/agents') return getAgents(req, env, cors)
  if (req.method === 'POST' && path === '/api/agents') return postAgents(req, env, cors)

      return json({ error: 'not_found' }, 404, cors)
    } catch (e: any) {
      return json({ error: 'server_error', message: e?.message || String(e) }, 500, cors)
    }
  }
}

// -------- Helpers
function json(body: any, status = 200, extra?: HeadersInit) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(extra||{}) } }) }
function nowIso(){ return new Date().toISOString() }
function nanoid(len=22){ const chars='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; let s=''; const arr=new Uint8Array(len); crypto.getRandomValues(arr); for(const b of arr){ s += chars[b%chars.length] } return s }
function getCookieMap(req: Request){ const h=req.headers.get('cookie')||''; const m=new Map<string,string>(); h.split(';').map(s=>s.trim()).filter(Boolean).forEach(p=>{ const i=p.indexOf('='); if(i>0){ m.set(p.slice(0,i), decodeURIComponent(p.slice(i+1))) } }); return m }
function cookieBase(env: Env){ const secure = (env.COOKIE_SECURE||'true').toLowerCase()==='true'; const sameSite = (env.COOKIE_SAMESITE||'Lax'); const domain = env.COOKIE_DOMAIN; return { secure, sameSite, domain, path: '/' } as const }
function setCookie(name: string, value: string, opts: { maxAge?: number } & ReturnType<typeof cookieBase>){
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`]
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  parts.push(`SameSite=${opts.sameSite}`)
  if (opts.secure) parts.push('Secure')
  parts.push('HttpOnly')
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`)
  return parts.join('; ')
}
function clearCookie(name: string, base: ReturnType<typeof cookieBase>){ return setCookie(name, '', { ...base, maxAge: 0 }) }

function corsHeaders(req: Request, env: Env){
  const origin = req.headers.get('Origin') || ''
  const raw = (env.ALLOWED_ORIGINS || env.CORS_ORIGINS || '')
  const allowed = raw.split(',').map(s=>s.trim()).filter(Boolean)
  const allowlist = new Set(allowed)
  const h: Record<string,string> = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type,x-csrf-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
  // Safer default: only echo Origin when explicitly allowlisted.
  if (origin && allowed.length > 0 && allowlist.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Vary'] = 'Origin'
  }
  return new Headers(h)
}

// Sessions in KV
const TTL_MS = 8 * 60 * 60 * 1000
async function putSession(env: Env, kind: 'admin'|'site', sid: string, data: any){ await env.SCHEDULE_KV.put(`${kind}:${sid}`, JSON.stringify({ ...data, exp: Date.now()+TTL_MS }), { expirationTtl: Math.ceil(TTL_MS/1000) }) }
async function getSession(env: Env, kind: 'admin'|'site', sid: string){ const raw = await env.SCHEDULE_KV.get(`${kind}:${sid}`); if(!raw) return null; try{ const j = JSON.parse(raw); if(j.exp && j.exp < Date.now()){ await env.SCHEDULE_KV.delete(`${kind}:${sid}`); return null } return j }catch{ return null } }
async function delSession(env: Env, kind: 'admin'|'site', sid: string){ await env.SCHEDULE_KV.delete(`${kind}:${sid}`) }

// Data storage in KV
function dataKey(env: Env){ return env.DATA_KEY || 'schedule.json' }
async function readDoc(env: Env): Promise<ScheduleDoc | null>{ const raw = await env.SCHEDULE_KV.get(dataKey(env)); if(!raw) return null; try{ return JSON.parse(raw) }catch{ return null } }
async function writeDoc(env: Env, doc: ScheduleDoc){ await env.SCHEDULE_KV.put(dataKey(env), JSON.stringify(doc, null, 2)) }

// Auth handlers
async function loginAdmin(req: Request, env: Env, cors: Headers){
  const base = cookieBase(env)
  const { password } = await safeJson(req)
  if(typeof password !== 'string' || password.length < 3) return json({ error:'invalid_input' }, 400, cors)
  if(password !== env.ADMIN_PASSWORD) return json({ error:'bad_password' }, 401, cors)
  const sid = nanoid(24)
  const csrf = nanoid(32)
  await putSession(env,'admin',sid,{ csrf })
  const headers = new Headers(cors)
  headers.append('Set-Cookie', setCookie('sid', sid, { ...base, maxAge: TTL_MS/1000 }))
  headers.append('Set-Cookie', setCookie('csrf', csrf, { ...base, maxAge: TTL_MS/1000 }))
  // Also include csrf in body so clients can store it when cookie is HttpOnly
  return json({ ok:true, csrf }, 200, headers)
}
async function logoutAdmin(req: Request, env: Env, cors: Headers){
  const base = cookieBase(env)
  const cookies = getCookieMap(req)
  const sid = cookies.get('sid')
  if(sid) await delSession(env,'admin',sid)
  const headers = new Headers(cors)
  headers.append('Set-Cookie', clearCookie('sid', base))
  headers.append('Set-Cookie', clearCookie('csrf', base))
  return json({ ok:true }, 200, headers)
}
async function loginSite(req: Request, env: Env, cors: Headers){
  const base = cookieBase(env)
  const { password } = await safeJson(req)
  if(typeof password !== 'string' || password.length < 3) return json({ error:'invalid_input' }, 400, cors)
  if(password !== env.SITE_PASSWORD) return json({ error:'bad_password' }, 401, cors)
  const sid = nanoid(24)
  await putSession(env,'site',sid,{})
  const headers = new Headers(cors)
  headers.append('Set-Cookie', setCookie('site_sid', sid, { ...base, maxAge: TTL_MS/1000 }))
  return json({ ok:true }, 200, headers)
}
async function logoutSite(req: Request, env: Env, cors: Headers){
  const base = cookieBase(env)
  const cookies = getCookieMap(req)
  const sid = cookies.get('site_sid')
  if(sid) await delSession(env,'site',sid)
  const headers = new Headers(cors)
  headers.append('Set-Cookie', clearCookie('site_sid', base))
  return json({ ok:true }, 200, headers)
}

// Guards
async function requireSite(req: Request, env: Env){
  if((env.REQUIRE_SITE_SESSION||'true').toLowerCase() !== 'true') return { ok:true }
  const cookies = getCookieMap(req)
  const sid = cookies.get('site_sid')
  if(!sid) return { ok:false, status: 401, body: { error:'missing_site_session' } }
  const sess = await getSession(env,'site',sid)
  if(!sess) return { ok:false, status: 401, body: { error:'expired_site_session' } }
  return { ok:true }
}
async function requireAdmin(req: Request, env: Env){
  const cookies = getCookieMap(req)
  const sid = cookies.get('sid')
  const csrfCookie = cookies.get('csrf')
  const csrfHeader = req.headers.get('x-csrf-token') || ''
  if(!sid || !csrfCookie || !csrfHeader) return { ok:false, status:401, body:{ error:'missing_auth', need: ['sid','csrf cookie','x-csrf-token header'] } }
  const sess = await getSession(env,'admin',sid)
  if(!sess) return { ok:false, status:401, body:{ error:'expired_admin_session' } }
  if(sess.csrf !== csrfCookie || sess.csrf !== csrfHeader) return { ok:false, status:403, body:{ error:'csrf_mismatch' } }
  return { ok:true }
}

// GET schedule
async function getSchedule(req: Request, env: Env, cors: Headers){
  const gate = await requireSite(req, env)
  if(!gate.ok) return json(gate.body, gate.status, cors)
  const doc = await readDoc(env)
  if(!doc){
    const empty: ScheduleDoc = { schemaVersion: 2, agents: [], shifts: [], pto: [], calendarSegs: [], updatedAt: nowIso(), agentsIndex: {} }
    await writeDoc(env, empty)
    return json(empty, 200, cors)
  }
  // Always ensure schemaVersion and defaults
  const safe: ScheduleDoc = { schemaVersion: Math.max(2, doc.schemaVersion||1), agents: doc.agents||[], shifts: doc.shifts||[], pto: doc.pto||[], calendarSegs: doc.calendarSegs||[], updatedAt: doc.updatedAt, agentsIndex: doc.agentsIndex||{} }
  return json(safe, 200, cors)
}

// POST schedule
async function postSchedule(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  const incoming = await safeJson(req)
  if(typeof incoming !== 'object' || incoming===null) return json({ error:'invalid_body' }, 400, cors)

  // Load previous doc for concurrency + mapping backfill
  const prev = (await readDoc(env)) || { schemaVersion:2, agents:[], shifts:[], pto:[], calendarSegs:[], agentsIndex:{} } as ScheduleDoc
  // Strict conflict only when shift/pto/calendar data is older; allow agents-only updates elsewhere
  if(prev.updatedAt && incoming.updatedAt && new Date(incoming.updatedAt) < new Date(prev.updatedAt)){
    const hasSchedChanges = Array.isArray(incoming.shifts) || Array.isArray(incoming.pto) || Array.isArray(incoming.calendarSegs)
    if(hasSchedChanges){
      return json({ error:'conflict', prevUpdatedAt: prev.updatedAt }, 409, cors)
    }
  }

  // Validate and normalize
  const result = normalizeAndValidate(incoming as Partial<ScheduleDoc>, prev)
  if(!result.ok){ return json({ error: result.error, details: result.details }, 400, cors) }
  const toWrite = result.doc

  await writeDoc(env, toWrite)
  return json({ ok:true, updatedAt: toWrite.updatedAt }, 200, cors)
}

// Body parser
async function safeJson(req: Request){ try{ return await req.json() }catch{ return {} } }

// ------------- Validation + Normalization
function hhmmToMin(hhmm: string){ if(hhmm==='24:00') return 1440; const m=hhmm.match(/^\d{2}:\d{2}$/); if(!m) return NaN; const [h,mm]=hhmm.split(':').map(n=>parseInt(n,10)); if(mm>=60) return NaN; return (h*60)+mm }
function nextDay(d: Day){ const arr: Day[]=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const i=arr.indexOf(d); return i<0?d:arr[(i+1)%7] }
function isDay(x:any): x is Day { return x==='Sun'||x==='Mon'||x==='Tue'||x==='Wed'||x==='Thu'||x==='Fri'||x==='Sat' }
function isHHMM(x:any){ return typeof x==='string' && /^\d{2}:\d{2}$/.test(x) }

function normalizeAndValidate(incoming: Partial<ScheduleDoc>, prev: ScheduleDoc): { ok:true; doc: ScheduleDoc } | { ok:false; error: string; details?: any }{
  const errors: any[] = []
  const doc: ScheduleDoc = { schemaVersion: Math.max(2, (incoming.schemaVersion||2)), agents: Array.isArray(incoming.agents)? incoming.agents as Agent[] : (Array.isArray(prev.agents)? prev.agents : []), shifts: Array.isArray(incoming.shifts)? incoming.shifts as Shift[] : [], pto: Array.isArray(incoming.pto)? incoming.pto as PTO[] : [], calendarSegs: Array.isArray(incoming.calendarSegs)? incoming.calendarSegs as CalendarSegment[] : [], agentsIndex: prev.agentsIndex||{}, updatedAt: nowIso() }

  // Basic shape checks
  for(const s of doc.shifts){
    if(!s || typeof s.id!=='string' || !s.id) errors.push({ where:'shift', id:s?.id, field:'id' })
    if(typeof s.person!=='string' || !s.person) errors.push({ where:'shift', id:s?.id, field:'person' })
    if(!isDay(s.day)) errors.push({ where:'shift', id:s?.id, field:'day' })
    if(!isHHMM(s.start) || !isHHMM(s.end)) errors.push({ where:'shift', id:s?.id, field:'time' })
  }
  for(const p of doc.pto){
    if(!p || typeof p.id!=='string' || !p.id) errors.push({ where:'pto', id:p?.id, field:'id' })
    if(typeof p.person!=='string' || !p.person) errors.push({ where:'pto', id:p?.id, field:'person' })
    if(typeof p.startDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) errors.push({ where:'pto', id:p?.id, field:'startDate' })
    if(typeof p.endDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.endDate)) errors.push({ where:'pto', id:p?.id, field:'endDate' })
  }
  for(const c of (doc.calendarSegs||[])){
    if(!c || typeof c.person!=='string' || !c.person) errors.push({ where:'cal', field:'person' })
    if(!isDay(c.day)) errors.push({ where:'cal', field:'day' })
    if(!isHHMM(c.start) || !isHHMM(c.end)) errors.push({ where:'cal', field:'time' })
    if(c.start===c.end) errors.push({ where:'cal', field:'time_equal' })
  }
  for(const a of (doc.agents||[])){
    if(!a || typeof a.id!=='string' || !a.id) errors.push({ where:'agent', field:'id' })
    if(typeof a.firstName!=='string' || typeof a.lastName!=='string') errors.push({ where:'agent', id:a?.id, field:'name' })
  }
  if(errors.length>0) return { ok:false, error:'invalid_body', details: errors }

  // Referential integrity: map person <-> agentId (consistent)
  const nameToId = new Map<string,string>()
  const idToName = new Map<string,string>()
  function addPair(name: string, id: string, where:any){ if(!name||!id) return; const key=name.trim().toLowerCase(); const exId=nameToId.get(key); if(exId && exId!==id) throw { type:'name_conflict', name, a:exId, b:id, where }; nameToId.set(key, id); const exName=idToName.get(id); if(exName && exName!==key) throw { type:'id_conflict', id, a:exName, b:key, where } ; idToName.set(id, key) }
  try{
    for(const s of doc.shifts){ if(s.agentId) addPair(s.person, s.agentId, { kind:'shift', id:s.id }) }
    for(const p of doc.pto){ if(p.agentId) addPair(p.person, p.agentId, { kind:'pto', id:p.id }) }
    for(const c of (doc.calendarSegs||[])){ if(c.agentId) addPair(c.person, c.agentId, { kind:'cal', person:c.person, day:c.day, start:c.start, end:c.end }) }
  }catch(err:any){ return { ok:false, error:'agent_mapping_conflict', details: err } }

  // Backfill missing agentIds using current or previous mapping
  const prevMap = new Map<string,string>()
  try{ if(prev.agentsIndex){ for(const [k,v] of Object.entries(prev.agentsIndex)) prevMap.set(k, v) } }catch{}
  const fillId = (name:string|undefined)=>{ const key=(name||'').trim().toLowerCase(); return nameToId.get(key) || prevMap.get(key) || undefined }
  for(const s of doc.shifts){ if(!s.agentId){ const id=fillId(s.person); if(id) s.agentId=id } }
  for(const p of doc.pto){ if(!p.agentId){ const id=fillId(p.person); if(id) p.agentId=id } }
  for(const c of (doc.calendarSegs||[])){ if(!c.agentId){ const id=fillId(c.person); if(id) c.agentId=id } }

  // Normalize endDay for shifts
  for(const s of doc.shifts){ const sMin=hhmmToMin(s.start); const eMin=hhmmToMin(s.end); if(Number.isNaN(sMin)||Number.isNaN(eMin)) continue; if(eMin===1440){ if(!s.endDay) s.endDay=s.day } else if(eMin<=sMin){ s.endDay = s.endDay || nextDay(s.day) } else { s.endDay = s.endDay || s.day } }

  // Ensure unique shift ids
  const seen=new Set<string>(); for(const s of doc.shifts){ if(seen.has(s.id)) return { ok:false, error:'duplicate_shift_id', details:{ id:s.id } }; seen.add(s.id) }

  // Build agentsIndex from current mapping (name->id), plus from provided agents[]
  const idx: Record<string,string> = {}
  for(const [k,v] of nameToId){ idx[k]=v }
  // Also incorporate mapping from agents list
  for(const a of (doc.agents||[])){ const full=`${(a.firstName||'').trim()} ${(a.lastName||'').trim()}`.trim().toLowerCase(); if(full && a.id && !idx[full]) idx[full]=a.id }
  doc.agentsIndex = idx

  // Final shape
  doc.schemaVersion = Math.max(2, doc.schemaVersion||2)
  return { ok:true, doc }
}

// -------- Agents-only endpoints
async function getAgents(req: Request, env: Env, cors: Headers){
  const gate = await requireSite(req, env)
  if(!gate.ok) return json(gate.body, gate.status, cors)
  const doc = await readDoc(env)
  return json({ agents: (doc?.agents||[]), updatedAt: doc?.updatedAt }, 200, cors)
}

async function postAgents(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  const body = await safeJson(req)
  const incomingAgents = Array.isArray(body?.agents) ? (body.agents as Agent[]) : null
  if(!incomingAgents) return json({ error:'invalid_body', details:'agents array required' }, 400, cors)

  const prev = (await readDoc(env)) || { schemaVersion:2, agents:[], shifts:[], pto:[], calendarSegs:[], agentsIndex:{} } as ScheduleDoc
  const merged = upsertAgents(prev.agents||[], incomingAgents)
  const idx: Record<string,string> = {}
  for(const a of merged){ const full=`${(a.firstName||'').trim()} ${(a.lastName||'').trim()}`.trim().toLowerCase(); if(full) idx[full] = a.id }
  const next: ScheduleDoc = { ...prev, agents: merged, agentsIndex: idx, updatedAt: nowIso() }
  await writeDoc(env, next)
  return json({ ok:true, updatedAt: next.updatedAt, count: merged.length }, 200, cors)
}

function upsertAgents(prev: Agent[], inc: Agent[]): Agent[]{
  const byId = new Map<string, Agent>()
  for(const a of prev){ if(a && a.id){ byId.set(a.id, { ...a }) } }
  for(const a of inc){
    if(!a) continue
    let id = a.id
    if(!id || typeof id !== 'string' || !id.trim()) id = nanoid(16)
    const firstName = (a.firstName||'').trim()
    const lastName = (a.lastName||'').trim()
    const tzId = a.tzId && typeof a.tzId==='string' ? a.tzId : undefined
    const hidden = !!a.hidden
    const existing = byId.get(id)
    if(existing){
      byId.set(id, { ...existing, firstName, lastName, tzId, hidden })
    }else{
      byId.set(id, { id, firstName, lastName, tzId, hidden })
    }
  }
  return Array.from(byId.values())
}
