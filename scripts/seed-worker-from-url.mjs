#!/usr/bin/env node
// Seed local Worker (dev) from a live schedule URL.
// Usage:
//   node scripts/seed-worker-from-url.mjs [sourceUrl]
// Env:
//   SOURCE_URL (fallback if no arg)
//   SOURCE_SITE_PASSWORD (optional; used to login-site on source before GET)
//   DEST_BASE (default http://localhost:8787)
//   ADMIN_PASSWORD (optional; dev admin pw for dest; falls back to parsing team-schedule-api/.dev.vars)

import fs from 'fs'
import path from 'path'

function arg(i){ return process.argv[i] }
const sourceUrl = arg(2) || process.env.SOURCE_URL || 'https://api.teamschedule.cc/api/schedule'
const DEST_BASE = (process.env.DEST_BASE || 'http://localhost:8787').replace(/\/$/,'')
const DEST_API = `${DEST_BASE}/api`
// Sanitize to avoid accidental newlines from quoted shell input
const SRC_SITE_PW = (process.env.SOURCE_SITE_PASSWORD || '').replace(/\r?\n/g,'')

// Try to read ADMIN_PASSWORD from .dev.vars for convenience
let ADMIN_PW = process.env.ADMIN_PASSWORD || ''
try{
  if(!ADMIN_PW){
    const p = path.join(process.cwd(), 'team-schedule-api/.dev.vars')
    if(fs.existsSync(p)){
      const raw = fs.readFileSync(p, 'utf8')
      const m = raw.match(/^ADMIN_PASSWORD\s*=\s*"?([^\r\n"]+)"?/m)
      if(m) ADMIN_PW = m[1]
    }
  }
}catch{}

if(!ADMIN_PW){
  console.warn('[seed] ADMIN_PASSWORD not found in env or .dev.vars; writes may fail.')
}

function nowIso(){ return new Date().toISOString() }

// Minimal cookie jar for Node fetch
class CookieJar{
  constructor(){ this.map = new Map() }
  ingest(setCookies){
    if(!setCookies) return
    const arr = Array.isArray(setCookies) ? setCookies : [setCookies]
    for(const sc of arr){
      const part = String(sc).split(';')[0]
      const eq = part.indexOf('=')
      if(eq<=0) continue
      const name = part.slice(0,eq).trim()
      const val = part.slice(eq+1).trim()
      if(name) this.map.set(name, val)
    }
  }
  header(){ return Array.from(this.map.entries()).map(([k,v])=> `${k}=${v}`).join('; ') }
}

async function getSetCookies(headers){
  // Node 20+ may expose headers.getSetCookie(); fall back to raw
  try{ if(typeof headers.getSetCookie === 'function'){ return headers.getSetCookie() } }catch{}
  try{ const raw = headers.raw?.(); if(raw && raw['set-cookie']) return raw['set-cookie'] }catch{}
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

async function fetchSource(){
  const url = new URL(sourceUrl)
  const base = url.origin + (url.pathname.includes('/api/') ? url.pathname.split('/api/')[0] : '') + '/api'
  const jar = new CookieJar()
  // 1) Try GET without login first (many deployments allow read without a site session)
  let r = await fetch(sourceUrl)
  if(r.ok){
    const j = await r.json(); if(!j || typeof j !== 'object') throw new Error('invalid JSON from source'); return j
  }
  // 2) If unauthorized and a site password is provided, login then retry GET
  if((r.status===401 || r.status===403) && SRC_SITE_PW){
    const login = await fetch(`${base}/login-site`,{ method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ password: SRC_SITE_PW }) })
    const sc = await getSetCookies(login.headers)
    jar.ingest(sc)
    if(!login.ok) throw new Error(`source login-site failed: ${login.status}`)
    r = await fetch(sourceUrl, { headers: jar.header()? { cookie: jar.header() } : undefined })
    if(!r.ok) throw new Error(`GET source schedule failed after login: ${r.status}`)
    const j = await r.json(); if(!j || typeof j !== 'object') throw new Error('invalid JSON from source'); return j
  }
  // 3) Otherwise, fail with original status and hint
  throw new Error(`GET source schedule failed: ${r.status} (set SOURCE_SITE_PASSWORD if a site session is required)`) 
}

async function seedDest(doc){
  const jar = new CookieJar()
  const r = await fetch(`${DEST_API}/login`,{
    method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ password: ADMIN_PW })
  })
  const sc = await getSetCookies(r.headers)
  jar.ingest(sc)
  if(!r.ok) throw new Error(`dest login failed: ${r.status}`)
  let csrf = ''
  let sidFromBody = ''
  try{ const j = await r.clone().json(); if(j && typeof j.csrf==='string') csrf = j.csrf; if(j && typeof j.sid==='string') sidFromBody = j.sid }catch{}
  if(!csrf){
    // Try to read csrf from cookies as fallback
    const m = jar.header().match(/(?:^|;\s*)csrf=([^;]+)/)
    if(m) csrf = m[1]
  }
  if(!csrf) throw new Error('missing CSRF after login')
  // Ensure csrf cookie is present in the header even if Set-Cookie was not parsed
  try{ if(!jar.map.has('csrf')) jar.map.set('csrf', csrf) }catch{}
  // If sid cookie was not captured, try sid from body (dev-only when RETURN_SID_IN_BODY=true)
  try{ if(!jar.map.has('sid') && sidFromBody) jar.map.set('sid', sidFromBody) }catch{}

  const payload = { ...doc, updatedAt: nowIso() }
  const res = await fetch(`${DEST_API}/schedule`,{
    method:'POST',
    headers:{ 'content-type':'application/json', 'x-csrf-token': csrf, 'cookie': jar.header() },
    body: JSON.stringify(payload)
  })
  if(!res.ok){
    const txt = await res.text().catch(()=> '')
    throw new Error(`POST dest schedule failed: ${res.status} ${txt}`)
  }
}

async function main(){
  console.log(`[seed] Source: ${sourceUrl}`)
  console.log(`[seed] Dest  : ${DEST_API}`)
  const doc = await fetchSource()
  console.log(`[seed] Pulled schedule: shifts=${(doc.shifts||[]).length}, pto=${(doc.pto||[]).length}, calSegs=${(doc.calendarSegs||[]).length||0}, agents=${(doc.agents||[]).length||0}`)
  await seedDest(doc)
  console.log('[seed] Wrote to local Worker OK')
}

main().catch(err=>{ console.error('[seed] ERROR:', err?.message || String(err)); process.exit(1) })
