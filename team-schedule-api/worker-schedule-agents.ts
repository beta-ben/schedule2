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
  SCHEDULE_KV?: KVNamespace
  ADMIN_PASSWORD: string
  SITE_PASSWORD: string
  ALLOWED_ORIGINS?: string
  CORS_ORIGINS?: string
  COOKIE_DOMAIN?: string
  COOKIE_SECURE?: string
  COOKIE_SAMESITE?: string
  REQUIRE_SITE_SESSION?: string
  DATA_KEY?: string
  // Optional during migration to D1
  DB?: D1Database
  USE_D1?: string
  // Dev convenience: include sid in login body for tooling
  RETURN_SID_IN_BODY?: string
  // Dev bearer mode (skip CSRF/cookies; accept Authorization: Bearer <token>)
  AUTH_DEV_MODE?: string
  DEV_BEARER_TOKEN?: string
  // Magic link auth
  AUTH_MODE?: string
  MAGIC_ALLOWED_DOMAINS?: string
  MAGIC_ADMIN_ALLOWLIST?: string
  MAGIC_LINK_TTL_MIN?: string
  MAGIC_ECHO_DEV?: string
  // Email provider (Resend)
  RESEND_API_KEY?: string
  MAGIC_FROM_EMAIL?: string
  // App redirect base for magic verify (e.g., http://localhost:5173 or https://teamschedule.cc)
  APP_REDIRECT_BASE?: string
  // Zoom OAuth
  ZOOM_CLIENT_ID?: string
  ZOOM_CLIENT_SECRET?: string
  ZOOM_REDIRECT_URI?: string
  ZOOM_SCOPE?: string
  ZOOM_AUTH_BASE?: string
  ZOOM_TOKEN_URL?: string
  ZOOM_API_BASE?: string
}

// Types
export type Day = 'Sun'|'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'
export type Shift = { id: string; person: string; agentId?: string; day: Day; start: string; end: string; endDay?: Day; segments?: Array<{ id: string; shiftId: string; taskId: string; startOffsetMin: number; durationMin: number; notes?: string }> }
export type PTO = { id: string; person: string; agentId?: string; startDate: string; endDate: string; notes?: string }
export type CalendarSegment = { person: string; agentId?: string; day: Day; start: string; end: string; taskId: string }
// Overrides: partial- or full-day one-off changes (swaps, half-days, etc.). Times are optional; when present, HH:MM format.
export type Override = { id: string; person: string; agentId?: string; startDate: string; endDate: string; start?: string; end?: string; endDay?: Day; kind?: string; notes?: string; recurrence?: { rule?: string; until?: string; count?: number } }
export type Agent = {
  id: string
  firstName: string
  lastName: string
  tzId?: string
  hidden?: boolean
  // Optional metadata
  isSupervisor?: boolean
  supervisorId?: string | null
  meetingCohort?: string
  notes?: string
}
export type ScheduleDoc = { schemaVersion: number; agents?: Agent[]; shifts: Shift[]; pto: PTO[]; overrides?: Override[]; calendarSegs?: CalendarSegment[]; updatedAt?: string; agentsIndex?: Record<string,string> }

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

  // Lightweight diagnostics during KV -> D1 migration
  if (req.method === 'GET' && path === '/api/_health') return health(req, env, cors)
  if (req.method === 'GET' && path === '/api/_version') return versionEndpoint(req, env, cors)
  if (req.method === 'GET' && path === '/health') return health(req, env, cors) // alias for CI tooling
  // Store toggle disabled in production; D1 is the source of truth
  if (req.method === 'GET' && path === '/api/_parity') return parityEndpoint(req, env, cors)
  // Magic link auth
  if (req.method === 'POST' && path === '/api/login-magic/request') return magicRequest(req, env, cors)
  if (req.method === 'GET' && path === '/api/login-magic/verify') return magicVerify(req, env, cors)
  if (req.method === 'GET' && path === '/login-magic') return magicLanding(req, env, cors)

  if (req.method === 'GET' && path === '/api/schedule') return getSchedule(req, env, cors)
  if (req.method === 'POST' && path === '/api/schedule') return postSchedule(req, env, cors)
  // v2 (D1) read-only endpoints for canary/parity
  if (req.method === 'GET' && path === '/api/v2/agents') return getAgentsV2(req, env, cors)
  if (req.method === 'GET' && path === '/api/v2/shifts') return getShiftsV2(req, env, cors)
  if (req.method === 'PATCH' && path === '/api/v2/agents') return patchAgentsV2(req, env, cors)
  if (req.method === 'POST' && path === '/api/v2/shifts/batch') return postShiftsBatchV2(req, env, cors)
  // v2 proposals (MVP)
  if (req.method === 'POST' && path === '/api/v2/proposals') return postProposalV2(req, env, cors)
  if (req.method === 'GET' && path === '/api/v2/proposals') return listProposalsV2(req, env, cors)
  if (req.method === 'GET' && path.startsWith('/api/v2/proposals/')){
    const id = path.split('/').pop() || ''
    return getProposalV2(req, env, cors, id)
  }
  if (req.method === 'PATCH' && path.startsWith('/api/v2/proposals/')){
    const parts = path.split('/')
    const id = parts[parts.length-1] || ''
    // Ignore /merge here; that route uses POST below
    if(id && id !== 'merge') return patchProposalV2(req, env, cors, id)
  }
  if (req.method === 'POST' && path.startsWith('/api/v2/proposals/')){
    // Expect /api/v2/proposals/:id/merge
    const parts = path.split('/')
    const last = parts[parts.length-1]
    const prev = parts[parts.length-2]
    if(last === 'merge' && prev && prev !== 'proposals'){
      const id = prev
      return mergeProposalV2(req, env, cors, id)
    }
  }
  // Agents-only endpoints to persist metadata (like hidden) without schedule conflicts
  if (req.method === 'GET' && path === '/api/agents') return getAgents(req, env, cors)
  if (req.method === 'POST' && path === '/api/agents') return postAgents(req, env, cors)
  // Admin: allowlist management
  if (req.method === 'GET' && path === '/api/admin/allowlist') return getAllowlist(req, env, cors)
  if (req.method === 'POST' && path === '/api/admin/allowlist') return postAllowlist(req, env, cors)
  // Zoom OAuth for multi-user ingestion
  if (req.method === 'GET' && path === '/api/zoom/oauth/url') return zoomOAuthUrl(req, env, cors)
  if (req.method === 'GET' && path === '/api/zoom/oauth/callback') return zoomOAuthCallback(req, env, cors)
  if (req.method === 'GET' && path === '/api/zoom/connections') return zoomConnectionsList(req, env, cors)
  if (req.method === 'DELETE' && path.startsWith('/api/zoom/connections/')){
    const id = path.split('/').pop() || ''
    return zoomConnectionsDelete(req, env, cors, id)
  }

      return json({ error: 'not_found' }, 404, cors)
    } catch (e: any) {
      return json({ error: 'server_error', message: e?.message || String(e) }, 500, cors)
    }
  }
}

// -------- Helpers
function json(body: any, status = 200, extra?: HeadersInit) {
  // If caller passed a Headers object (as we do in login to append multiple Set-Cookie values),
  // clone it directly so we don't lose duplicate Set-Cookie entries when iterating.
  if (extra instanceof Headers) {
    const headers = new Headers(extra)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    applySecurityHeaders(headers)
    return new Response(JSON.stringify(body), { status, headers })
  }
  const headers = new Headers({ 'content-type': 'application/json' })
  if (extra) {
    if (Array.isArray(extra)) {
      for (const [k, v] of extra as Array<[string, string]>) headers.set(k, v)
    } else {
      for (const [k, v] of Object.entries(extra as Record<string, string>)) headers.set(k, v)
    }
  }
  applySecurityHeaders(headers)
  return new Response(JSON.stringify(body), { status, headers })
}
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
function setCookieReadable(name: string, value: string, opts: { maxAge?: number } & ReturnType<typeof cookieBase>){
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`]
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  parts.push(`SameSite=${opts.sameSite}`)
  if (opts.secure) parts.push('Secure')
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`)
  return parts.join('; ')
}
function clearCookie(name: string, base: ReturnType<typeof cookieBase>){ return setCookie(name, '', { ...base, maxAge: 0 }) }

// Store is locked to D1 in production. KV is used only for migration if bound.

function applySecurityHeaders(headers: Headers){
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'same-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('Cross-Origin-Resource-Policy', 'same-site')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
}

function corsHeaders(req: Request, env: Env){
  const origin = req.headers.get('Origin') || ''
  const raw = (env.ALLOWED_ORIGINS || env.CORS_ORIGINS || '')
  const allowed = raw.split(',').map(s=>s.trim()).filter(Boolean)
  const allowlist = new Set(allowed)
  const allowAll = allowed.includes('*')
  const h: Record<string,string> = {
    'Access-Control-Allow-Credentials': 'true',
    // Allow Content-Type for JSON, x-csrf-token for writes, x-admin-sid for header-based session, and Authorization for dev bearer/test tools
    'Access-Control-Allow-Headers': 'content-type,x-csrf-token,x-admin-sid,authorization',
    // Include PATCH for v2/agents; keep GET/POST/OPTIONS
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  }
  // Safer default: only echo Origin when explicitly allowlisted.
  if (origin && (allowAll || (allowed.length > 0 && allowlist.has(origin)))) {
    h['Access-Control-Allow-Origin'] = allowAll ? origin : origin
    h['Vary'] = 'Origin'
  }
  const headers = new Headers(h)
  applySecurityHeaders(headers)
  return headers
}

// ---- Magic link helpers
async function sha256Hex(input: string): Promise<string> { const data = new TextEncoder().encode(input); const buf = await crypto.subtle.digest('SHA-256', data); const arr = Array.from(new Uint8Array(buf)); return arr.map(b => b.toString(16).padStart(2, '0')).join('') }
function randToken(len=48){ return nanoid(Math.max(32, len)) }
function emailParts(e:string){ const s=(e||'').trim().toLowerCase(); const i=s.lastIndexOf('@'); return { local: i>0? s.slice(0,i): s, domain: i>0? s.slice(i+1): '' } }
function allowedRoleFor(env: Env, email: string, requested?: string): 'admin'|'site'{ const req = (requested||'').toLowerCase(); const list = (env.MAGIC_ADMIN_ALLOWLIST||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean); if(list.includes(email.toLowerCase())) return 'admin'; return 'site' }
function isEmailAllowed(env: Env, email: string): boolean{ const { domain } = emailParts(email); const raw = (env.MAGIC_ALLOWED_DOMAINS||'').trim(); if(raw === '*' || raw === '') return true; const set = new Set(raw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)); if(!domain) return false; return set.has(domain) }
function linkTtl(env: Env): number{ const n = parseInt(env.MAGIC_LINK_TTL_MIN||'15',10); return Number.isFinite(n) && n>0? n: 15 }
function echoDev(env: Env){ const v=(env.MAGIC_ECHO_DEV||'').toLowerCase(); return v==='1'||v==='true' }
async function sendMagicEmail(env: Env, to: string, verifyUrl: string, role: 'admin'|'site'){
  const key = (env.RESEND_API_KEY||'').trim()
  const from = (env.MAGIC_FROM_EMAIL||'').trim()
  if(!key || !from) return false
  const subject = role==='admin'? 'Sign in to Manage' : 'Sign in to Schedule'
  const html = `<p>Click to sign in:</p><p><a href="${verifyUrl}">Sign in</a></p><p>This link expires soon and can be used once.</p>`
  const body = { from, to, subject, html }
  try{
    const r = await fetch('https://api.resend.com/emails',{
      method:'POST', headers:{ 'content-type':'application/json', 'authorization': `Bearer ${key}` }, body: JSON.stringify(body)
    })
    return r.ok
  }catch{ return false }
}

async function magicRequest(req: Request, env: Env, cors: Headers){
  try{
    await ensureD1Schema(env)
    const { email: rawEmail, role: wantRole } = await safeJson<{ email?: string; role?: string }>(req)
    const email = (rawEmail||'').trim().toLowerCase()
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error:'invalid_email' }, 400, cors)
    if(!isEmailAllowed(env, email)) return json({ error:'forbidden_email' }, 403, cors)
    // Throttle: tokens per minute per email
    try{ const recent = await env.DB!.prepare('SELECT COUNT(*) as c FROM magic_tokens WHERE email=?1 AND created_at > unixepoch()-60').bind(email).first<{ c: number }>(); if(recent && Number(recent.c) > 3) return json({ error:'rate_limited' }, 429, cors) }catch{}
    // Resolve role: prefer D1 users table, then env allowlist, else site
    let role: 'admin'|'site' = 'site'
    try{
      const u = await env.DB!.prepare('SELECT role,active FROM users WHERE email=?1').bind(email).first<{ role?: string; active?: number }>()
      if(u && Number(u.active)===1 && String(u.role||'').toLowerCase()==='admin') role='admin'
      else if(allowedRoleFor(env, email, wantRole)==='admin') role='admin'
    }catch{ if(allowedRoleFor(env, email, wantRole)==='admin') role='admin' }
    const token = randToken(64)
    const hash = await sha256Hex(token)
    const expMin = linkTtl(env)
    await env.DB!.prepare('INSERT INTO magic_tokens (token_hash,email,role,exp_ts) VALUES (?1,?2,?3,unixepoch()+?4)').bind(hash, email, role, expMin*60).run()
    const base = new URL(req.url)
    const appBase = (env.APP_REDIRECT_BASE||'').trim()
    const verifyUrl = `${base.origin}/api/login-magic/verify?token=${encodeURIComponent(token)}${appBase?`&r=${encodeURIComponent(appBase)}`:''}`
    const landingUrl = `${base.origin}/login-magic?token=${encodeURIComponent(token)}${appBase?`&r=${encodeURIComponent(appBase)}`:''}`
    if(echoDev(env)) return json({ ok:true, role, link: landingUrl }, 200, cors)
    const sent = await sendMagicEmail(env, email, landingUrl, role)
    if(!sent){ console.log(`[magic] (fallback) Send link to ${email}: ${verifyUrl}`) }
    return json({ ok:true, sent }, 200, cors)
  }catch(e:any){ return json({ error:'server_error', message: e?.message || String(e) }, 500, cors) }
}

async function magicVerify(req: Request, env: Env, cors: Headers){
  try{
    await ensureD1Schema(env)
    const url = new URL(req.url)
    const token = url.searchParams.get('token')||''
    if(!token || token.length < 16) return json({ error:'invalid_token' }, 400, cors)
    const hash = await sha256Hex(token)
    const row = await env.DB!.prepare('SELECT email,role,exp_ts,used_at FROM magic_tokens WHERE token_hash=?1').bind(hash).first<{ email:string; role:string; exp_ts:number; used_at?: number }>()
    if(!row) return json({ error:'not_found' }, 404, cors)
    const now = Math.floor(Date.now()/1000)
    if(row.used_at && Number(row.used_at)>0) return json({ error:'already_used' }, 400, cors)
    if(!row.exp_ts || Number(row.exp_ts) < now) return json({ error:'expired' }, 400, cors)
    await env.DB!.prepare('UPDATE magic_tokens SET used_at=unixepoch() WHERE token_hash=?1').bind(hash).run()
    const base = cookieBase(env)
    const accept = (req.headers.get('accept')||'').toLowerCase()
    const wantsHtml = accept.includes('text/html') || accept.includes('text/*')
    const appBase = (url.searchParams.get('r')||env.APP_REDIRECT_BASE||'').trim()
    if((row.role||'site').toLowerCase() === 'admin'){
      // Admin session (for writes)
      const sid = nanoid(24); const csrf = nanoid(32)
      await putSession(env,'admin',sid,{ csrf })
      // Also grant a site session so reads work without a second login
      const siteSid = nanoid(24)
      await putSession(env,'site',siteSid,{})
      const headers = new Headers(cors)
      headers.append('Set-Cookie', setCookie('sid', sid, { ...base, maxAge: TTL_MS/1000 }))
      headers.append('Set-Cookie', setCookieReadable('csrf', csrf, { ...base, maxAge: TTL_MS/1000 }))
      headers.append('Set-Cookie', setCookie('site_sid', siteSid, { ...base, maxAge: TTL_MS/1000 }))
      if(appBase){
        const loc = `${appBase.replace(/\/$/,'')}/#/manage`
        headers.set('Location', loc)
        if(wantsHtml){
          const html = `<!doctype html><meta http-equiv="refresh" content="0;url=${loc}"><a href="${loc}">Continue</a>`
          headers.set('Content-Type','text/html; charset=utf-8')
          return new Response(html, { status: 302, headers })
        }
        // Non-HTML clients: JSON with location
        headers.set('Content-Type','application/json')
        return new Response(JSON.stringify({ ok:true, role:'admin', location: loc }), { status: 200, headers })
      }else{
        headers.set('Content-Type','application/json')
        return new Response(JSON.stringify({ ok:true, role:'admin', location:'/#/manage' }), { status: 200, headers })
      }
    }else{
      const sid = nanoid(24)
      await putSession(env,'site',sid,{})
      const headers = new Headers(cors)
      headers.append('Set-Cookie', setCookie('site_sid', sid, { ...base, maxAge: TTL_MS/1000 }))
      if(appBase){
        const loc = `${appBase.replace(/\/$/,'')}/#/`
        headers.set('Location', loc)
        if(wantsHtml){
          const html = `<!doctype html><meta http-equiv="refresh" content="0;url=${loc}"><a href="${loc}">Continue</a>`
          headers.set('Content-Type','text/html; charset=utf-8')
          return new Response(html, { status: 302, headers })
        }
        headers.set('Content-Type','application/json')
        return new Response(JSON.stringify({ ok:true, role:'site', location: loc }), { status: 200, headers })
      }else{
        headers.set('Content-Type','application/json')
        return new Response(JSON.stringify({ ok:true, role:'site', location:'/#/' }), { status: 200, headers })
      }
    }
  }catch(e:any){ return json({ error:'server_error', message: e?.message || String(e) }, 500, cors) }
}

// Landing page to avoid email scanners consuming tokens.
// Serves a simple HTML with a button that navigates to /api/login-magic/verify.
async function magicLanding(req: Request, env: Env, cors: Headers){
  const url = new URL(req.url)
  const token = url.searchParams.get('token')||''
  const appBase = (url.searchParams.get('r')||env.APP_REDIRECT_BASE||'').trim()
  const base = cookieBase(env)
  const headers = new Headers(cors)
  headers.set('content-type','text/html; charset=utf-8')
  const verifyPath = `/api/login-magic/verify?token=${encodeURIComponent(token)}${appBase?`&r=${encodeURIComponent(appBase)}`:''}`
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0a0a0a;color:#eaeaea;margin:0} .card{background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:480px;box-shadow:0 2px 24px rgba(0,0,0,.4)} button{background:#2563eb;border:0;color:white;border-radius:10px;padding:10px 14px;font-weight:600} a{color:#60a5fa}</style>
<body><div class="card">
  <h1 style="margin:0 0 8px 0;font-size:20px">Sign in to Team Schedule</h1>
  <p style="margin:0 0 16px 0;opacity:.8">This link requires a manual click to finish signing in.</p>
  <div>
    <button id="go">Continue</button>
    <div id="msg" style="margin-top:10px;font-size:13px;opacity:.8"></div>
  </div>
  <script>
    const btn=document.getElementById('go');
    const msg=document.getElementById('msg');
    btn.addEventListener('click',()=>{
      msg.textContent='Signing in...';
      window.location.href = ${JSON.stringify(verifyPath)};
    });
  </script>
</div></body></html>`
  return new Response(html, { status: 200, headers })
}

// Dev-bearer admin check
function authDevBearerOk(req: Request, env: Env){
  const on = (env.AUTH_DEV_MODE||'').toLowerCase()
  if(!(on==='1' || on==='true')) return false
  const want = (env.DEV_BEARER_TOKEN||'').trim()
  if(!want) return false
  const h = req.headers.get('authorization')||''
  const m = h.match(/^Bearer\s+(.+)$/i)
  if(!m) return false
  return m[1] === want
}

// Sessions (D1 when enabled, otherwise KV)
const TTL_MS = 8 * 60 * 60 * 1000
async function putSession(env: Env, kind: 'admin'|'site', sid: string, data: any){
  if(useD1(env)) return putSessionD1(env, kind, sid, data)
  const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
  if(!kvNs) throw new Error('kv_unavailable')
  await kvNs.put(`${kind}:${sid}`, JSON.stringify({ ...data, exp: Date.now()+TTL_MS }), { expirationTtl: Math.ceil(TTL_MS/1000) })
}
async function getSession(env: Env, kind: 'admin'|'site', sid: string){
  if(useD1(env)) return getSessionD1(env, kind, sid)
  const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
  if(!kvNs) return null
  const raw = await kvNs.get(`${kind}:${sid}`)
  if(!raw) return null
  try{ const j = JSON.parse(raw); if(j.exp && j.exp < Date.now()){ await kvNs.delete(`${kind}:${sid}`); return null } return j }catch{ return null }
}
async function delSession(env: Env, kind: 'admin'|'site', sid: string){
  if(useD1(env)) return delSessionD1(env, kind, sid)
  const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
  if(!kvNs) return
  await kvNs.delete(`${kind}:${sid}`)
}

async function putSessionD1(env: Env, kind: 'admin'|'site', sid: string, data: any){
  if(!env.DB) throw new Error('d1_unavailable')
  const exp = Math.floor((Date.now()+TTL_MS)/1000)
  await ensureD1Schema(env)
  await env.DB.prepare(
    `INSERT INTO sessions (id,kind,csrf,exp_ts,updated_at,created_at)
     VALUES (?1,?2,?3,?4,unixepoch(),unixepoch())
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, csrf=excluded.csrf, exp_ts=excluded.exp_ts, updated_at=unixepoch()`
  ).bind(sid, kind, (data?.csrf||null), exp).run()
}
async function getSessionD1(env: Env, kind: 'admin'|'site', sid: string){
  if(!env.DB) return null
  try{
    await ensureD1Schema(env)
    const row = await env.DB.prepare('SELECT csrf, exp_ts FROM sessions WHERE id=?1 AND kind=?2').bind(sid, kind).first<{ csrf?: string; exp_ts: number }>()
    if(!row) return null
    const now = Math.floor(Date.now()/1000)
    if(!row.exp_ts || row.exp_ts < now){ await env.DB.prepare('DELETE FROM sessions WHERE id=?1').bind(sid).run(); return null }
    const out: any = {}
    if(typeof row.csrf === 'string') out.csrf = row.csrf
    out.exp = row.exp_ts * 1000
    return out
  }catch{ return null }
}
async function delSessionD1(env: Env, kind: 'admin'|'site', sid: string){
  if(!env.DB) return
  await env.DB.prepare('DELETE FROM sessions WHERE id=?1').bind(sid).run()
}

// Data storage in KV or D1 (settings)
function dataKey(env: Env){ return env.DATA_KEY || 'schedule.json' }
function useD1(env: Env){
  // Always prefer D1 when a DB binding exists. During rollout, we ignore USE_D1 overrides
  // to reduce parity issues between KV and D1. KV remains a mirror/fallback.
  return !!env.DB
}
// Dev convenience: auto-create required tables if missing
async function ensureD1Schema(env: Env){
  if(!env.DB) return
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, val TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()))').run()
  }catch{}
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, csrf TEXT, exp_ts INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_kind_exp ON sessions(kind, exp_ts)').run()
  }catch{}
  // Core tables used by v2 endpoints (create on demand in dev)
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, active INTEGER NOT NULL DEFAULT 1, meta TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active)').run()
    // Shifts table for v2 endpoints
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        start_ts INTEGER NOT NULL,
        end_ts INTEGER NOT NULL,
        role TEXT,
        note TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
      )`
    ).run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_shifts_start ON shifts(start_ts)').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_shifts_agent_start ON shifts(agent_id,start_ts)').run()
  }catch{}
  // Magic link tokens and users allowlist
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS magic_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, exp_ts INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()))').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_exp ON magic_tokens(exp_ts)').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_email_created ON magic_tokens(email,created_at)').run()
  }catch{}
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT (unixepoch()))').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)').run()
  }catch{}
  // Proposals (simple, stores patch JSON in row)
  try{
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_by TEXT,
        reviewers TEXT,
        week_start TEXT,
        tz_id TEXT,
        base_updated_at TEXT,
        patch TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    ).run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status, updated_at)').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at)').run()
  }catch{}
  // Zoom OAuth connections
  try{
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS zoom_connections (
        id TEXT PRIMARY KEY,
        zoom_user_id TEXT NOT NULL UNIQUE,
        email TEXT,
        display_name TEXT,
        account_id TEXT,
        scope TEXT,
        token_type TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        refresh_expires_at INTEGER,
        last_synced_at INTEGER,
        sync_cursor TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    ).run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_zoom_connections_email ON zoom_connections(email)').run()
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_zoom_connections_expires ON zoom_connections(expires_at)').run()
  }catch{}
}
async function readDocD1(env: Env): Promise<ScheduleDoc | null>{
  if(!env.DB) return null
  try{
    await ensureD1Schema(env)
    const row = await env.DB.prepare('SELECT val FROM settings WHERE key=?1').bind(dataKey(env)).first<{ val: string }>()
    if(!row || row.val == null) return null
    try { return JSON.parse(String(row.val)) as ScheduleDoc } catch { return null }
  }catch{ return null }
}
async function writeDocD1(env: Env, doc: ScheduleDoc){
  if(!env.DB) throw new Error('d1_unavailable')
  const json = JSON.stringify(doc, null, 2)
  await ensureD1Schema(env)
  await env.DB.prepare(
    `INSERT INTO settings (key,val,updated_at) VALUES (?1,?2,unixepoch())
     ON CONFLICT(key) DO UPDATE SET val=excluded.val, updated_at=unixepoch()`
  ).bind(dataKey(env), json).run()
}
// Prefer configured store, but auto-migrate once if data exists in the other store.
// This heals deployments where bindings or USE_D1 flipped and avoids “missing data”.
async function readDoc(env: Env): Promise<ScheduleDoc | null>{
  const key = dataKey(env)
  if(useD1(env)){
    // Preferred: D1
    const d1 = await readDocD1(env)
    if(d1) return d1
    // Fallback: try KV, then migrate into D1 if found
    try{
      const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
      if(kvNs){
        const raw = await kvNs.get(key)
        if(raw){
          try{ const fromKv = JSON.parse(raw) as ScheduleDoc; await writeDocD1(env, fromKv); return fromKv }catch{}
        }
      }
    }catch{}
    return null
  } else {
    // Preferred: KV
    try{
      const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
      if(kvNs){
        const raw = await kvNs.get(key)
        if(raw){ try{ return JSON.parse(raw) as ScheduleDoc }catch{ return null } }
      }
    }catch{}
    // Fallback: try D1, then mirror into KV if found
    const fromD1 = await readDocD1(env)
    if(fromD1){ try{ const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined; if(kvNs) await kvNs.put(key, JSON.stringify(fromD1, null, 2)) }catch{}; return fromD1 }
    return null
  }
}
async function writeDoc(env: Env, doc: ScheduleDoc){
  const key = dataKey(env)
  const json = JSON.stringify(doc, null, 2)
  if(useD1(env)){
    await writeDocD1(env, doc)
    // Best-effort mirror to KV for safety during transitions
    try{ const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined; if(kvNs) await kvNs.put(key, json) }catch{}
  } else {
    const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
    if(kvNs) await kvNs.put(key, json)
    // Best-effort mirror to D1 when bound
    try{ await writeDocD1(env, doc) }catch{}
  }
}

// Auth handlers
async function loginAdmin(req: Request, env: Env, cors: Headers){
  const base = cookieBase(env)
  const { password } = await safeJson<{ password?: string }>(req)
  if(typeof password !== 'string' || password.length < 3) return json({ error:'invalid_input' }, 400, cors)
  if(password !== env.ADMIN_PASSWORD) return json({ error:'bad_password' }, 401, cors)
  const sid = nanoid(24)
  const csrf = nanoid(32)
  await putSession(env,'admin',sid,{ csrf })
  const headers = new Headers(cors)
  headers.append('Set-Cookie', setCookie('sid', sid, { ...base, maxAge: TTL_MS/1000 }))
  headers.append('Set-Cookie', setCookieReadable('csrf', csrf, { ...base, maxAge: TTL_MS/1000 }))
  // Also include csrf and sid in body so clients can store them when cookie scoping prevents storage
  return json({ ok:true, csrf, sid }, 200, headers)
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
  const { password } = await safeJson<{ password?: string }>(req)
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
  // Dev bearer: bypass cookie+CSRF when enabled
  if(authDevBearerOk(req, env)) return { ok:true }
  const cookies = getCookieMap(req)
  const sidHeader = req.headers.get('x-admin-sid') || ''
  const sid = cookies.get('sid') || sidHeader
  const csrfHeader = req.headers.get('x-csrf-token') || ''
  if(!sid || !csrfHeader) return { ok:false, status:401, body:{ error:'missing_auth', need: ['sid','x-csrf-token header'] } }
  const sess = await getSession(env,'admin',sid)
  if(!sess) return { ok:false, status:401, body:{ error:'expired_admin_session' } }
  if(sess.csrf !== csrfHeader) return { ok:false, status:403, body:{ error:'csrf_mismatch' } }
  return { ok:true }
}

// GET schedule
async function getSchedule(req: Request, env: Env, cors: Headers){
  const gate = await requireSite(req, env)
  if(!gate.ok) return json(gate.body, gate.status, cors)
  const doc = await readDoc(env)
  if(!doc){
    const empty: ScheduleDoc = { schemaVersion: 2, agents: [], shifts: [], pto: [], overrides: [], calendarSegs: [], updatedAt: nowIso(), agentsIndex: {} }
    await writeDoc(env, empty)
    return json(empty, 200, cors)
  }
  // Always ensure schemaVersion and defaults
  const safe: ScheduleDoc = { schemaVersion: Math.max(2, doc.schemaVersion||1), agents: doc.agents||[], shifts: doc.shifts||[], pto: doc.pto||[], overrides: doc.overrides||[], calendarSegs: doc.calendarSegs||[], updatedAt: doc.updatedAt, agentsIndex: doc.agentsIndex||{} }
  return json(safe, 200, cors)
}

// POST schedule
async function postSchedule(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  const incoming = await safeJson<Partial<ScheduleDoc>>(req)
  if(typeof incoming !== 'object' || incoming===null) return json({ error:'invalid_body' }, 400, cors)

  // Load previous doc for concurrency + mapping backfill
  const prev = (await readDoc(env)) || { schemaVersion:2, agents:[], shifts:[], pto:[], overrides:[], calendarSegs:[], agentsIndex:{} } as ScheduleDoc
  // Strict conflict only when shift/pto/calendar data is older; allow agents-only updates elsewhere
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'
  if(!force && prev.updatedAt && incoming.updatedAt && new Date(incoming.updatedAt) < new Date(prev.updatedAt)){
    const hasSchedChanges = Array.isArray(incoming.shifts) || Array.isArray(incoming.pto) || Array.isArray(incoming.overrides) || Array.isArray(incoming.calendarSegs)
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
async function safeJson<T = any>(req: Request): Promise<T>{ try{ return await req.json() }catch{ return {} as T } }

// ------------- Validation + Normalization
function hhmmToMin(hhmm: string){ if(hhmm==='24:00') return 1440; const m=hhmm.match(/^\d{2}:\d{2}$/); if(!m) return NaN; const [h,mm]=hhmm.split(':').map(n=>parseInt(n,10)); if(mm>=60) return NaN; return (h*60)+mm }
function nextDay(d: Day){ const arr: Day[]=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']; const i=arr.indexOf(d); return i<0?d:arr[(i+1)%7] }
function isDay(x:any): x is Day { return x==='Sun'||x==='Mon'||x==='Tue'||x==='Wed'||x==='Thu'||x==='Fri'||x==='Sat' }
function isHHMM(x:any){ return typeof x==='string' && /^\d{2}:\d{2}$/.test(x) }

function normalizeAndValidate(incoming: Partial<ScheduleDoc>, prev: ScheduleDoc): { ok:true; doc: ScheduleDoc } | { ok:false; error: string; details?: any }{
  const errors: any[] = []
  const doc: ScheduleDoc = {
    schemaVersion: Math.max(2, (incoming.schemaVersion||2)),
    agents: Array.isArray(incoming.agents)? incoming.agents as Agent[] : (Array.isArray(prev.agents)? prev.agents : []),
    shifts: Array.isArray(incoming.shifts)? incoming.shifts as Shift[] : [],
    pto: Array.isArray(incoming.pto)? incoming.pto as PTO[] : [],
    overrides: Array.isArray((incoming as any).overrides)? (incoming as any).overrides as Override[] : [],
    calendarSegs: Array.isArray(incoming.calendarSegs)? incoming.calendarSegs as CalendarSegment[] : [],
    agentsIndex: prev.agentsIndex||{},
    updatedAt: nowIso()
  }

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
  for(const o of (doc.overrides||[])){
    if(!o || typeof o.id!=='string' || !o.id) errors.push({ where:'override', field:'id' })
    if(typeof o.person!=='string' || !o.person) errors.push({ where:'override', id:o?.id, field:'person' })
    if(typeof (o as any).startDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test((o as any).startDate)) errors.push({ where:'override', id:o?.id, field:'startDate' })
    if(typeof (o as any).endDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test((o as any).endDate)) errors.push({ where:'override', id:o?.id, field:'endDate' })
    if(typeof (o as any).start==='string' || typeof (o as any).end==='string'){
      if(!isHHMM((o as any).start) || !isHHMM((o as any).end)) errors.push({ where:'override', id:o?.id, field:'time' })
    }
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
    for(const o of (doc.overrides||[])){ if((o as any).agentId) addPair((o as any).person, (o as any).agentId, { kind:'override', id:(o as any).id }) }
  }catch(err:any){ return { ok:false, error:'agent_mapping_conflict', details: err } }

  // Backfill missing agentIds using current or previous mapping
  const prevMap = new Map<string,string>()
  try{ if(prev.agentsIndex){ for(const [k,v] of Object.entries(prev.agentsIndex)) prevMap.set(k, v) } }catch{}
  const fillId = (name:string|undefined)=>{ const key=(name||'').trim().toLowerCase(); return nameToId.get(key) || prevMap.get(key) || undefined }
  for(const s of doc.shifts){ if(!s.agentId){ const id=fillId(s.person); if(id) s.agentId=id } }
  for(const p of doc.pto){ if(!p.agentId){ const id=fillId(p.person); if(id) p.agentId=id } }
  for(const o of (doc.overrides||[])){ if(!(o as any).agentId){ const id=fillId((o as any).person); if(id) (o as any).agentId=id } }
  for(const c of (doc.calendarSegs||[])){ if(!c.agentId){ const id=fillId(c.person); if(id) c.agentId=id } }

  // Normalize endDay for shifts
  for(const s of doc.shifts){ const sMin=hhmmToMin(s.start); const eMin=hhmmToMin(s.end); if(Number.isNaN(sMin)||Number.isNaN(eMin)) continue; if(eMin===1440){ if(!s.endDay) s.endDay=s.day } else if(eMin<=sMin){ s.endDay = s.endDay || nextDay(s.day) } else { s.endDay = s.endDay || s.day } }

  // Ensure unique shift ids
  const seen=new Set<string>(); for(const s of doc.shifts){ if(seen.has(s.id)) return { ok:false, error:'duplicate_shift_id', details:{ id:s.id } }; seen.add(s.id) }
  // Ensure unique override ids
  const seenO=new Set<string>(); for(const o of (doc.overrides||[])){ const oid=(o as any).id; if(typeof oid==='string'){ if(seenO.has(oid)) return { ok:false, error:'duplicate_override_id', details:{ id:oid } }; seenO.add(oid) } }

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
  const body = await safeJson<{ agents?: Agent[] }>(req)
  const incomingAgents = Array.isArray(body?.agents) ? (body.agents as Agent[]) : null
  if(!incomingAgents) return json({ error:'invalid_body', details:'agents array required' }, 400, cors)

  const prev = (await readDoc(env)) || { schemaVersion:2, agents:[], shifts:[], pto:[], overrides:[], calendarSegs:[], agentsIndex:{} } as ScheduleDoc
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
    const isSupervisor = a.isSupervisor===true
    const supervisorId = (typeof a.supervisorId==='string' && a.supervisorId.trim()) ? a.supervisorId : (a.supervisorId===null? null: (byId.get(id)?.supervisorId))
    const notes = typeof a.notes==='string' ? a.notes : (byId.get(id)?.notes)
    const existing = byId.get(id)
    let meetingCohort = existing?.meetingCohort
    if(Object.prototype.hasOwnProperty.call(a, 'meetingCohort')){
      const raw = (a as any).meetingCohort
      if(typeof raw === 'string'){
        const trimmed = raw.trim()
        meetingCohort = trimmed ? trimmed : undefined
      } else if(raw === null){
        meetingCohort = undefined
      }
    }
    if(existing){
      byId.set(id, { ...existing, firstName, lastName, tzId, hidden, isSupervisor, supervisorId, notes, meetingCohort })
    }else{
      byId.set(id, { id, firstName, lastName, tzId, hidden, isSupervisor, supervisorId, notes, meetingCohort })
    }
  }
  return Array.from(byId.values())
}

async function parityEndpoint(req: Request, env: Env, cors: Headers){
  // Compare top-level doc presence/updatedAt from KV vs D1 availability
  const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
  const kvRaw = kvNs ? await kvNs.get(dataKey(env)) : undefined
  let kvUpdatedAt: string | undefined
  try{ if(kvRaw){ const j = JSON.parse(kvRaw); if(j && typeof j.updatedAt==='string') kvUpdatedAt = j.updatedAt } }catch{}
  let d1Ok = false
  try{ if(env.DB){ const r = await env.DB.prepare('SELECT 1 as ok').first<any>(); d1Ok = !!(r && (r.ok===1||r.ok==='1')) } }catch{}
  return json({ kv: { present: !!kvRaw, updatedAt: kvUpdatedAt }, d1: { ok: d1Ok } }, 200, cors)
}

// Simple version echo to verify live code + vars
async function versionEndpoint(req: Request, env: Env, cors: Headers){
  const body = {
    ok: true,
    time: nowIso(),
    vars: {
      require_site_session: (env.REQUIRE_SITE_SESSION||'').toString(),
      use_d1: (env.USE_D1||'').toString(),
      app_redirect_base: (env.APP_REDIRECT_BASE||'').toString(),
      allowed_origins: (env.ALLOWED_ORIGINS||env.CORS_ORIGINS||'').toString(),
    },
    routes: {
      magic_landing: '/login-magic',
      magic_request: '/api/login-magic/request',
      magic_verify: '/api/login-magic/verify',
      schedule: '/api/schedule'
    }
  }
  return json(body, 200, cors)
}

// ---- Diagnostics endpoint
async function health(req: Request, env: Env, cors: Headers){
  // No auth; read-only status for canarying and smoke checks
  // KV probe
  let kvOk = false
  let kvUpdatedAt: string | undefined
  try{
    const kvNs = (env as any).SCHEDULE_KV as KVNamespace | undefined
    const raw = kvNs ? await kvNs.get(dataKey(env)) : undefined
    if(raw){ try{ const j = JSON.parse(raw as string); if(j && typeof j.updatedAt === 'string') kvUpdatedAt = j.updatedAt }catch{} }
    kvOk = !!kvNs
  }catch{ kvOk = false }
  // D1 probe
  let d1Ok = false
  let d1Message: string | undefined
  try{
    if(env.DB){
      const r = await env.DB.prepare('SELECT 1 as ok').first<any>()
      d1Ok = !!(r && (r.ok === 1 || r.ok === '1'))
    }else{
      d1Ok = false
      d1Message = 'no_binding'
    }
  }catch(e:any){ d1Ok = false; d1Message = e?.message || String(e) }

  const body = { ok: true, kv: { ok: kvOk, updatedAt: kvUpdatedAt }, d1: { ok: d1Ok, message: d1Message }, use_d1: (env.USE_D1||'0') }
  return json(body, 200, cors)
}

// ---- v2 read endpoints (D1-backed, canary-friendly)
type D1AgentRow = { id: string; name: string; color?: string; active: number; meta?: unknown }
type D1ShiftRow = { id: string; agent_id: string; start_ts: number; end_ts: number; role?: string; note?: string }

async function getAgentsV2(req: Request, env: Env, cors: Headers){
  const gate = await requireSite(req, env)
  if(!gate.ok) return json(gate.body, gate.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const { results } = await env.DB.prepare('SELECT id,name,color,active,meta FROM agents WHERE active=1 ORDER BY name').all()
  const agents = (results||[]).map((r:any)=>{
    const meta = r.meta ? (()=>{ try{return JSON.parse(String(r.meta))}catch{return undefined} })() : undefined
    const name = String(r.name||'')
    const parts = name.split(' ')
    const firstName = (parts[0]||'').trim()
    const lastName = parts.slice(1).join(' ').trim()
    const out: any = {
      id: r.id as string,
      name,
      color: r.color ?? undefined,
      active: Number(r.active) ?? 1,
      meta,
      firstName,
      lastName,
    }
    if(meta && typeof meta==='object'){
      if(typeof (meta as any).tzId === 'string') out.tzId = (meta as any).tzId
      if('hidden' in (meta as any)) out.hidden = !!(meta as any).hidden
      if('isSupervisor' in (meta as any)) out.isSupervisor = !!(meta as any).isSupervisor
      if('supervisorId' in (meta as any)) out.supervisorId = (meta as any).supervisorId ?? null
      if(typeof (meta as any).meetingCohort === 'string') out.meetingCohort = (meta as any).meetingCohort
      if(typeof (meta as any).notes === 'string') out.notes = (meta as any).notes
    }
    return out
  })
  return json({ agents: agents as any }, 200, cors)
}

async function getShiftsV2(req: Request, env: Env, cors: Headers){
  const gate = await requireSite(req, env)
  if(!gate.ok) return json(gate.body, gate.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const url = new URL(req.url)
  const start = Number(url.searchParams.get('start_ts')||'')
  const end = Number(url.searchParams.get('end_ts')||'')
  if(!Number.isFinite(start) || !Number.isFinite(end) || !(end>start)) return json({ error:'invalid_range' }, 400, cors)
  const { results } = await env.DB.prepare('SELECT id,agent_id,start_ts,end_ts,role,note FROM shifts WHERE start_ts < ?2 AND end_ts > ?1 ORDER BY start_ts').bind(start,end).all()
  return json({ shifts: (results||[]) as D1ShiftRow[] }, 200, cors)
}

// ---- v2 write endpoints (D1-backed)
async function patchAgentsV2(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const body = await safeJson<any>(req)
  const arr: any[] = Array.isArray(body) ? body : (Array.isArray(body?.agents) ? body.agents : [])
  if(!Array.isArray(arr)) return json({ error:'invalid_body' }, 400, cors)
  let updated = 0, created = 0
  for(const raw of arr){
    if(!raw) continue
    let id = (raw.id && String(raw.id).trim()) || ''
    const firstName = (raw.firstName||'').trim()
    const lastName = (raw.lastName||'').trim()
    const name = (raw.name && String(raw.name).trim()) || `${firstName} ${lastName}`.trim()
    if(!name){ continue }
    const color = raw.color ?? null
    const active = (raw.active===0 || raw.active===false) ? 0 : 1
    const metaObj: any = typeof raw.meta==='object' && raw.meta ? { ...raw.meta } : {}
    if(typeof raw.tzId==='string') metaObj.tzId = raw.tzId
    if('hidden' in raw) metaObj.hidden = !!raw.hidden
    if('isSupervisor' in raw) metaObj.isSupervisor = !!raw.isSupervisor
    if('supervisorId' in raw) metaObj.supervisorId = raw.supervisorId ?? null
    if('meetingCohort' in raw){
      if(typeof raw.meetingCohort === 'string'){
        const trimmed = raw.meetingCohort.trim()
        metaObj.meetingCohort = trimmed ? trimmed : null
      } else if(raw.meetingCohort === null){
        metaObj.meetingCohort = null
      }
    }
    if(typeof raw.notes==='string') metaObj.notes = raw.notes
    const meta = Object.keys(metaObj).length>0 ? JSON.stringify(metaObj) : null
    if(!id) id = nanoid(16)
    // Upsert
    await env.DB.prepare(
      `INSERT INTO agents (id,name,color,active,meta)
       VALUES (?1,?2,?3,?4,?5)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, active=excluded.active, meta=excluded.meta, updated_at=unixepoch()`
    ).bind(id, name, color, active, meta).run()
    // Determine created vs updated (best-effort: check rowcount is always 1 on D1; treat as updated unless id was blank)
    if(raw.id) updated++; else created++
  }
  return json({ ok:true, updated, created }, 200, cors)
}

type DocShift = { id: string; person: string; agentId?: string; day: Day; start: string; end: string; endDay?: Day }
async function postShiftsBatchV2(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  const body = await safeJson<any>(req)
  const upserts: DocShift[] = Array.isArray(body?.upserts) ? body.upserts : []
  const deletes: string[] = Array.isArray(body?.deletes) ? body.deletes : []
  if(!Array.isArray(upserts) && !Array.isArray(deletes)) return json({ error:'invalid_body' }, 400, cors)

  // Merge into existing doc in KV/D1 for now (idempotent per shift id)
  const prev = (await readDoc(env)) || { schemaVersion:2, agents:[], shifts:[], pto:[], overrides:[], calendarSegs:[], agentsIndex:{} } as ScheduleDoc
  const byId = new Map<string, Shift>()
  for(const s of prev.shifts||[]){ if(s && s.id) byId.set(s.id, s) }

  // Basic normalize helper for endDay
  function normalizeEndDay(s: DocShift): DocShift{
    const sMin = hhmmToMin(s.start); const eMin = hhmmToMin(s.end)
    if(Number.isNaN(sMin) || Number.isNaN(eMin)) return s
    if(eMin===1440){ if(!s.endDay) s.endDay = s.day }
    else if(eMin<=sMin){ s.endDay = s.endDay || nextDay(s.day) }
    else { s.endDay = s.endDay || s.day }
    return s
  }

  let upserted = 0; let removed = 0
  // Apply deletes first
  for(const id of deletes){ if(typeof id==='string' && byId.delete(id)) removed++ }
  // Apply upserts
  for(const raw of upserts){
    if(!raw || typeof raw.id !== 'string' || !raw.id) continue
    if(!isDay(raw.day) || !isHHMM(raw.start) || !isHHMM(raw.end)) continue
    const s = normalizeEndDay({ ...raw })
    const out: Shift = { id: s.id, person: s.person||'', agentId: s.agentId||undefined, day: s.day, start: s.start, end: s.end, endDay: s.endDay }
    byId.set(out.id, out); upserted++
  }

  const next: ScheduleDoc = { ...prev, shifts: Array.from(byId.values()), updatedAt: nowIso() }
  await writeDoc(env, next)
  return json({ ok:true, upserted, deleted: removed, updatedAt: next.updatedAt }, 200, cors)
}

// ---- Allowlist management (D1 users table)
async function getAllowlist(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  try{
    await ensureD1Schema(env)
    const { results } = await env.DB!.prepare('SELECT email, role, active FROM users ORDER BY email').all()
    return json({ ok:true, users: (results||[]).map((r:any)=>({ email: String(r.email), role: String(r.role||'site'), active: Number(r.active)===1 })) }, 200, cors)
  }catch{ return json({ error:'read_failed' }, 500, cors) }
}

async function postAllowlist(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  try{
    await ensureD1Schema(env)
    const body = await safeJson<any>(req)
    const add: string[] = Array.isArray(body?.add) ? body.add : []
    const remove: string[] = Array.isArray(body?.remove) ? body.remove : []
    const role = (body?.role||'admin').toLowerCase()==='admin' ? 'admin' : 'site'
    let added=0, removed=0
    const norm = (s:string)=> String(s||'').trim().toLowerCase()
    for(const raw of add){
      const email = norm(raw)
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue
      await env.DB!.prepare('INSERT INTO users (email,role,active,updated_at) VALUES (?1,?2,1,unixepoch()) ON CONFLICT(email) DO UPDATE SET role=excluded.role, active=1, updated_at=unixepoch()').bind(email, role).run()
      added++
    }
    for(const raw of remove){
      const email = norm(raw)
      await env.DB!.prepare('UPDATE users SET active=0, updated_at=unixepoch() WHERE email=?1').bind(email).run()
      removed++
    }
    return json({ ok:true, added, removed }, 200, cors)
  }catch{ return json({ error:'write_failed' }, 500, cors) }
}

// ---- Zoom OAuth connections
type ZoomTokenResponse = {
  access_token: string
  token_type?: string
  refresh_token: string
  expires_in?: number
  scope?: string
  refresh_token_expires_in?: number
  account_id?: string
  user_id?: string
}
type ZoomUserProfile = {
  id?: string
  email?: string
  display_name?: string
  first_name?: string
  last_name?: string
  account_id?: string
}
type ZoomConnectionRow = {
  id: string
  zoom_user_id: string
  email?: string
  display_name?: string
  account_id?: string
  scope?: string
  token_type?: string
  expires_at?: number
  refresh_expires_at?: number
  last_synced_at?: number
  sync_cursor?: string
  created_at?: number
  updated_at?: number
}
type ZoomConnectionSummary = {
  id: string
  zoomUserId: string
  email?: string | null
  displayName?: string | null
  accountId?: string | null
  scope?: string | null
  tokenType?: string | null
  expiresAt?: number | null
  refreshExpiresAt?: number | null
  lastSyncedAt?: number | null
  hasSyncCursor: boolean
  createdAt?: number | null
  updatedAt?: number | null
}

async function zoomOAuthUrl(req: Request, env: Env, cors: Headers){
  const cfg = zoomConfig(env, req)
  if(!cfg) return json({ error:'zoom_not_configured' }, 501, cors)
  const state = nanoid(32)
  const headers = new Headers(cors)
  headers.append('Set-Cookie', setCookie('zoom_oauth_state', state, { ...cookieBase(env), maxAge: 600 }))
  const authorizeUrl = `${cfg.authorizeUrl}?response_type=code&client_id=${encodeURIComponent(cfg.clientId)}&redirect_uri=${encodeURIComponent(cfg.redirectUri)}&scope=${encodeURIComponent(cfg.scope)}&state=${encodeURIComponent(state)}`
  return json({ ok:true, url: authorizeUrl, scope: cfg.scope }, 200, headers)
}

async function zoomOAuthCallback(req: Request, env: Env, cors: Headers){
  const cfg = zoomConfig(env, req)
  if(!cfg) return json({ error:'zoom_not_configured' }, 501, cors)
  const url = new URL(req.url)
  const cookies = getCookieMap(req)
  const expectedState = cookies.get('zoom_oauth_state') || ''
  const base = cookieBase(env)
  const headers = new Headers(cors)
  headers.append('Set-Cookie', clearCookie('zoom_oauth_state', base))
  const wantsHtml = (req.headers.get('accept')||'').toLowerCase().includes('text/html')

  const queryError = url.searchParams.get('error')
  if(queryError){
    const detail = url.searchParams.get('error_description') || url.searchParams.get('reason') || ''
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'oauth_denied', [queryError, detail].filter(Boolean).join(': '))
  }

  const state = url.searchParams.get('state') || ''
  if(!state || !expectedState || state !== expectedState){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'state_mismatch')
  }

  const code = url.searchParams.get('code') || ''
  if(!code){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'missing_code')
  }

  if(!env.DB){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'd1_unavailable')
  }

  await ensureD1Schema(env)

  const nowSec = Math.floor(Date.now()/1000)
  let tokenJson: ZoomTokenResponse | null = null
  try{
    const body = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(cfg.redirectUri)}`
    const tokenRes = await fetch(cfg.tokenUrl,{
      method:'POST',
      headers:{
        'content-type':'application/x-www-form-urlencoded',
        'authorization': `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`
      },
      body
    })
    if(!tokenRes.ok){
      return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'token_exchange_failed', String(tokenRes.status))
    }
    tokenJson = await tokenRes.json<ZoomTokenResponse>()
  }catch(e:any){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'token_exchange_error', e?.message || 'fetch_failed')
  }

  if(!tokenJson || typeof tokenJson.access_token !== 'string' || typeof tokenJson.refresh_token !== 'string'){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'token_missing')
  }

  const expiresIn = Number(tokenJson.expires_in)
  const expiresAt = Number.isFinite(expiresIn) && expiresIn>0 ? nowSec + Math.round(expiresIn) : nowSec + 3600
  const refreshExpiresIn = Number((tokenJson as any).refresh_token_expires_in)
  const refreshExpiresAt = Number.isFinite(refreshExpiresIn) && refreshExpiresIn>0 ? nowSec + Math.round(refreshExpiresIn) : null

  let profile: ZoomUserProfile | null = null
  try{
    const profileRes = await fetch(`${cfg.apiBase}/users/me`,{
      method:'GET',
      headers:{ 'authorization': `Bearer ${tokenJson.access_token}` }
    })
    if(!profileRes.ok){
      return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'profile_fetch_failed', String(profileRes.status))
    }
    profile = await profileRes.json<ZoomUserProfile>()
  }catch(e:any){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'profile_fetch_error', e?.message || 'fetch_failed')
  }

  const zoomUserId = String(profile?.id || tokenJson.user_id || '').trim()
  if(!zoomUserId){
    return zoomFinishRedirect(env, req, headers, wantsHtml, false, 'missing_user_id')
  }

  const email = profile?.email ? String(profile.email).trim() : undefined
  const displayNameRaw = profile?.display_name || `${profile?.first_name||''} ${profile?.last_name||''}`.trim()
  const displayName = displayNameRaw ? displayNameRaw.trim() : (email || zoomUserId)
  const accountId = profile?.account_id || tokenJson.account_id || undefined

  await saveZoomConnection(env, {
    zoomUserId,
    email,
    displayName,
    accountId: accountId ? String(accountId).trim() : undefined,
    scope: tokenJson.scope,
    tokenType: tokenJson.token_type,
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    expiresAt,
    refreshExpiresAt,
  })

  return zoomFinishRedirect(env, req, headers, wantsHtml, true, 'linked')
}

async function zoomConnectionsList(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const rows = await env.DB.prepare('SELECT id, zoom_user_id, email, display_name, account_id, scope, token_type, expires_at, refresh_expires_at, last_synced_at, sync_cursor, created_at, updated_at FROM zoom_connections ORDER BY updated_at DESC').all<ZoomConnectionRow>()
  const data = (rows.results || []) as ZoomConnectionRow[]
  const results = data.map((r)=>{
    const summary: ZoomConnectionSummary = {
      id: String(r.id),
      zoomUserId: String(r.zoom_user_id),
      email: r.email ? String(r.email) : null,
      displayName: r.display_name ? String(r.display_name) : null,
      accountId: r.account_id ? String(r.account_id) : null,
      scope: r.scope ? String(r.scope) : null,
      tokenType: r.token_type ? String(r.token_type) : null,
      expiresAt: r.expires_at != null ? Number(r.expires_at) : null,
      refreshExpiresAt: r.refresh_expires_at != null ? Number(r.refresh_expires_at) : null,
      lastSyncedAt: r.last_synced_at != null ? Number(r.last_synced_at) : null,
      hasSyncCursor: typeof r.sync_cursor === 'string' && r.sync_cursor.length > 0,
      createdAt: r.created_at != null ? Number(r.created_at) : null,
      updatedAt: r.updated_at != null ? Number(r.updated_at) : null,
    }
    return summary
  })
  return json({ ok:true, connections: results }, 200, cors)
}

async function zoomConnectionsDelete(req: Request, env: Env, cors: Headers, id: string){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  if(!id){
    return json({ error:'invalid_id' }, 400, cors)
  }
  await ensureD1Schema(env)
  const res = await env.DB.prepare('DELETE FROM zoom_connections WHERE id=?1').bind(id).run()
  const deleted = typeof res.changes === 'number' ? res.changes : (res as any)?.meta?.changes || 0
  return json({ ok:true, deleted: Number(deleted) || 0 }, 200, cors)
}

type ZoomConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  authorizeUrl: string
  tokenUrl: string
  apiBase: string
}

function zoomConfig(env: Env, req?: Request): ZoomConfig | null {
  const clientId = (env.ZOOM_CLIENT_ID || '').trim()
  const clientSecret = (env.ZOOM_CLIENT_SECRET || '').trim()
  if(!clientId || !clientSecret) return null
  let redirectUri = (env.ZOOM_REDIRECT_URI || '').trim()
  if(!redirectUri && req){
    try{
      const origin = new URL(req.url).origin
      redirectUri = `${origin}/api/zoom/oauth/callback`
    }catch{}
  }
  if(!redirectUri) return null
  const authBase = ((env.ZOOM_AUTH_BASE || 'https://zoom.us').trim() || 'https://zoom.us').replace(/\/$/, '')
  const tokenUrl = (env.ZOOM_TOKEN_URL || `${authBase}/oauth/token`).trim()
  const authorizeUrl = `${authBase}/oauth/authorize`
  const apiBase = ((env.ZOOM_API_BASE || 'https://api.zoom.us/v2').trim() || 'https://api.zoom.us/v2').replace(/\/$/, '')
  const scope = ((env.ZOOM_SCOPE || 'phone:read:list phone:read phone_recording:read phone_voicemail:read phone_sms:read').trim()) || 'phone:read:list phone:read'
  return { clientId, clientSecret, redirectUri, scope, authorizeUrl, tokenUrl, apiBase }
}

async function saveZoomConnection(env: Env, payload: { zoomUserId: string; email?: string; displayName?: string; accountId?: string; scope?: string; tokenType?: string; accessToken: string; refreshToken: string; expiresAt: number; refreshExpiresAt?: number | null }){
  await env.DB!.prepare(
    `INSERT INTO zoom_connections (id, zoom_user_id, email, display_name, account_id, scope, token_type, access_token, refresh_token, expires_at, refresh_expires_at, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,unixepoch(),unixepoch())
     ON CONFLICT(zoom_user_id) DO UPDATE SET
       email=excluded.email,
       display_name=excluded.display_name,
       account_id=excluded.account_id,
       scope=excluded.scope,
       token_type=excluded.token_type,
       access_token=excluded.access_token,
       refresh_token=excluded.refresh_token,
       expires_at=excluded.expires_at,
       refresh_expires_at=excluded.refresh_expires_at,
       updated_at=unixepoch()`
  ).bind(
    nanoid(24),
    payload.zoomUserId,
    payload.email ?? null,
    payload.displayName ?? null,
    payload.accountId ?? null,
    payload.scope ?? null,
    payload.tokenType ?? null,
    payload.accessToken,
    payload.refreshToken,
    payload.expiresAt,
    payload.refreshExpiresAt ?? null
  ).run()
}

function zoomFinishRedirect(env: Env, req: Request, headers: Headers, wantsHtml: boolean, success: boolean, code: string, detail?: string){
  const status = success ? 'success' : 'error'
  const location = buildZoomRedirectLocation(env, req, status, code, detail)
  if(wantsHtml){
    const title = success ? 'Zoom Connected' : 'Zoom Connection Error'
    const message = success ? 'Zoom account connected. You can close this tab.' : 'Unable to connect your Zoom account.'
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta http-equiv="refresh" content="2;url=${escapeHtml(location)}"><body><p>${escapeHtml(message)}</p>${detail?`<p>${escapeHtml(detail)}</p>`:''}<p><a href="${escapeHtml(location)}">Continue</a></p></body></html>`
    headers.set('content-type','text/html; charset=utf-8')
    return new Response(html, { status: success ? 200 : 400, headers })
  }
  headers.set('Location', location)
  return new Response(null, { status: 302, headers })
}

function buildZoomRedirectLocation(env: Env, req: Request, status: string, code: string, detail?: string){
  const base = (env.APP_REDIRECT_BASE || '').trim() || (()=>{ try{ return new URL(req.url).origin }catch{ return '' } })()
  const trimmed = base ? base.replace(/\/$/, '') : ''
  const params = new URLSearchParams()
  params.set('zoomStatus', status)
  if(code) params.set('zoomCode', code)
  if(detail) params.set('zoomDetail', detail)
  const suffix = `/#/manage${params.toString() ? `?${params.toString()}` : ''}`
  if(!trimmed) return suffix
  return `${trimmed}${suffix}`
}

function escapeHtml(s: string){
  return s.replace(/[&<>"']/g, ch=>{
    if(ch === '&') return '&amp;'
    if(ch === '<') return '&lt;'
    if(ch === '>') return '&gt;'
    if(ch === "\"") return '&quot;'
    if(ch === "\'") return '&#39;'
    return ch
  })
}

// ---- Proposals (MVP)
type ProposalRow = { id:string; title?:string; description?:string; status:string; created_by?:string; reviewers?:string; week_start?:string; tz_id?:string; base_updated_at?:string; patch?:string; created_at:number; updated_at:number }
async function postProposalV2(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const body = await safeJson<any>(req)
  const title = typeof body?.title==='string' && body.title.trim() ? body.title.trim() : `Proposal ${new Date().toLocaleString('en-US')}`
  const description = typeof body?.description==='string' ? body.description : null
  const week_start = typeof body?.weekStart==='string' ? body.weekStart : null
  const tz_id = typeof body?.tzId==='string' ? body.tzId : null
  const base_updated_at = typeof body?.baseUpdatedAt==='string' ? body.baseUpdatedAt : null
  const patchObj = typeof body?.patch==='object' && body.patch ? body.patch : {
    shifts: Array.isArray(body?.shifts)? body.shifts : [],
    pto: Array.isArray(body?.pto)? body.pto : [],
    overrides: Array.isArray(body?.overrides)? body.overrides : [],
    calendarSegs: Array.isArray(body?.calendarSegs)? body.calendarSegs : [],
    agents: Array.isArray(body?.agents)? body.agents : [],
  }
  const patch = JSON.stringify(patchObj)
  const id = nanoid(24)
  await env.DB.prepare(
    `INSERT INTO proposals (id,title,description,status,created_by,reviewers,week_start,tz_id,base_updated_at,patch,created_at,updated_at)
     VALUES (?1,?2,?3,'open',NULL,NULL,?4,?5,?6,?7,unixepoch(),unixepoch())`
  ).bind(id, title, description, week_start, tz_id, base_updated_at, patch).run()
  return json({ ok:true, id }, 200, cors)
}

async function listProposalsV2(req: Request, env: Env, cors: Headers){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const { results } = await env.DB.prepare('SELECT id, title, description, status, created_by, reviewers, week_start, tz_id, base_updated_at, created_at, updated_at FROM proposals ORDER BY updated_at DESC LIMIT 200').all()
  const items = (results||[]).map((r:any)=>({
    id: String(r.id),
    title: r.title? String(r.title): undefined,
    description: r.description? String(r.description): undefined,
    status: String(r.status||'open'),
    createdBy: r.created_by? String(r.created_by): undefined,
    reviewers: r.reviewers? JSON.parse(String(r.reviewers)) : undefined,
    weekStart: r.week_start? String(r.week_start): undefined,
    tzId: r.tz_id? String(r.tz_id): undefined,
    baseUpdatedAt: r.base_updated_at? String(r.base_updated_at): undefined,
    createdAt: Number(r.created_at)||0,
    updatedAt: Number(r.updated_at)||0,
  }))
  return json({ ok:true, proposals: items }, 200, cors)
}

async function getProposalV2(req: Request, env: Env, cors: Headers, id: string){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const row = await env.DB.prepare('SELECT id, title, description, status, created_by, reviewers, week_start, tz_id, base_updated_at, patch, created_at, updated_at FROM proposals WHERE id=?1').bind(id).first<ProposalRow>()
  if(!row) return json({ error:'not_found' }, 404, cors)
  let patch: any
  try{ patch = row.patch ? JSON.parse(String((row as any).patch)) : undefined }catch{ patch = undefined }
  return json({ ok:true, proposal: {
    id: String(row.id),
    title: row.title,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    reviewers: row.reviewers ? JSON.parse(row.reviewers) : undefined,
    weekStart: row.week_start,
    tzId: row.tz_id,
    baseUpdatedAt: row.base_updated_at,
    patch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } }, 200, cors)
}

// Update proposal metadata and status (open|in_review|approved|rejected|closed)
async function patchProposalV2(req: Request, env: Env, cors: Headers, id: string){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)
  const body = await safeJson<any>(req)
  const allowedStatus = new Set(['open','in_review','approved','rejected','closed','merged'])
  const fields: string[] = []
  const binds: any[] = []
  if(typeof body?.title === 'string'){ fields.push('title=?'+(fields.length+1)); binds.push(body.title) }
  if(typeof body?.description === 'string'){ fields.push('description=?'+(fields.length+1)); binds.push(body.description) }
  if(typeof body?.status === 'string'){
    const st = String(body.status).toLowerCase()
    if(!allowedStatus.has(st)) return json({ error:'invalid_status' }, 400, cors)
    // 'merged' should be set via merge endpoint; allow here but not recommended
    fields.push('status=?'+(fields.length+1)); binds.push(st)
  }
  if(fields.length === 0) return json({ ok:true }, 200, cors)
  const sql = `UPDATE proposals SET ${fields.join(',')}, updated_at=unixepoch() WHERE id=?${fields.length+1}`
  binds.push(id)
  const r = await env.DB.prepare(sql).bind(...binds).run()
  const changed = (r as any)?.changes || (r as any)?.meta?.changes || 0
  if(!changed) return json({ error:'not_found' }, 404, cors)
  return json({ ok:true }, 200, cors)
}

// Merge a proposal patch into the live schedule doc with optional optimistic concurrency.
// If the proposal has base_updated_at set and it differs from current doc.updatedAt, returns 409 unless ?force=1.
async function mergeProposalV2(req: Request, env: Env, cors: Headers, id: string){
  const admin = await requireAdmin(req, env)
  if(!admin.ok) return json(admin.body, admin.status, cors)
  if(!env.DB) return json({ error:'d1_unavailable' }, 503, cors)
  await ensureD1Schema(env)

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'

  const row = await env.DB.prepare('SELECT id, status, base_updated_at, patch FROM proposals WHERE id=?1').bind(id).first<ProposalRow>()
  if(!row) return json({ error:'not_found' }, 404, cors)
  let patch: any
  try{ patch = row.patch ? JSON.parse(String((row as any).patch)) : {} }catch{ patch = {} }

  const prev = (await readDoc(env)) || { schemaVersion:2, agents:[], shifts:[], pto:[], overrides:[], calendarSegs:[], agentsIndex:{} } as ScheduleDoc
  if(row.base_updated_at && prev.updatedAt && !force){
    try{
      const a = new Date(prev.updatedAt).getTime()
      const b = new Date(row.base_updated_at).getTime()
      if(Number.isFinite(a) && Number.isFinite(b) && a !== b){
        return json({ error:'conflict', prevUpdatedAt: prev.updatedAt, baseUpdatedAt: row.base_updated_at }, 409, cors)
      }
    }catch{}
  }

  // Build incoming doc using proposal patch arrays; leave unspecified sections empty so validator replaces only those.
  const incoming: Partial<ScheduleDoc> = {
    shifts: Array.isArray(patch?.shifts) ? patch.shifts : [],
    pto: Array.isArray(patch?.pto) ? patch.pto : [],
    overrides: Array.isArray(patch?.overrides) ? patch.overrides : [],
    calendarSegs: Array.isArray(patch?.calendarSegs) ? patch.calendarSegs : [],
    agents: Array.isArray(patch?.agents) ? patch.agents : (prev.agents || [])
  }
  const normalized = normalizeAndValidate(incoming, prev)
  if(!normalized.ok){
    return json({ error:'invalid_patch', details: (normalized as any).details || (normalized as any).error }, 400, cors)
  }
  const next = normalized.doc
  await writeDoc(env, next)

  // Mark proposal merged and update timestamp
  try{ await env.DB.prepare('UPDATE proposals SET status=\'merged\', updated_at=unixepoch() WHERE id=?1').bind(id).run() }catch{}

  return json({ ok:true, updatedAt: next.updatedAt }, 200, cors)
}
