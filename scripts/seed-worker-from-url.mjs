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
let DEV_BEARER = process.env.DEV_BEARER_TOKEN || ''
try{
  if(!ADMIN_PW){
    const p = path.join(process.cwd(), 'team-schedule-api/.dev.vars')
    if(fs.existsSync(p)){
      const raw = fs.readFileSync(p, 'utf8')
      const m = raw.match(/^ADMIN_PASSWORD\s*=\s*"?([^\r\n"]+)"?/m)
      if(m) ADMIN_PW = m[1]
      const b = raw.match(/^DEV_BEARER_TOKEN\s*=\s*"?([^\r\n"]+)"?/m)
      if(b) DEV_BEARER = b[1]
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

// Shared source session jar so agents fetch can reuse login-site
const SRC_JAR = new CookieJar()

async function sourceLoginIfNeeded(base){
  if(!SRC_SITE_PW) return false
  // If we already have a site_sid cookie, skip
  if(SRC_JAR.map.has('site_sid')) return true
  const r = await fetch(`${base}/login-site`,{ method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ password: SRC_SITE_PW }) })
  const sc = await getSetCookies(r.headers)
  SRC_JAR.ingest(sc)
  return r.ok
}

async function fetchSource(){
  const url = new URL(sourceUrl)
  const base = url.origin + (url.pathname.includes('/api/') ? url.pathname.split('/api/')[0] : '') + '/api'
  const jar = SRC_JAR
  // 1) Try GET without login first (many deployments allow read without a site session)
  let r = await fetch(sourceUrl)
  if(r.ok){
    const j = await r.json(); if(!j || typeof j !== 'object') throw new Error('invalid JSON from source'); return j
  }
  // 2) If unauthorized and a site password is provided, login then retry GET
  if((r.status===401 || r.status===403) && SRC_SITE_PW){
    const ok = await sourceLoginIfNeeded(base)
    if(!ok) throw new Error(`source login-site failed`)
    r = await fetch(sourceUrl, { headers: jar.header()? { cookie: jar.header() } : undefined })
    if(!r.ok) throw new Error(`GET source schedule failed after login: ${r.status}`)
    const j = await r.json(); if(!j || typeof j !== 'object') throw new Error('invalid JSON from source'); return j
  }
  // 3) Otherwise, fail with original status and hint
  throw new Error(`GET source schedule failed: ${r.status} (set SOURCE_SITE_PASSWORD if a site session is required)`) 
}

async function fetchSourceAgents(){
  const url = new URL(sourceUrl)
  const base = url.origin + (url.pathname.includes('/api/') ? url.pathname.split('/api/')[0] : '') + '/api'
  // Try /api/agents first (same shape as doc.agents)
  try{
    // If a site password is provided, ensure we have a session so agents endpoint can be read
    if(SRC_SITE_PW) await sourceLoginIfNeeded(base)
    const r = await fetch(`${base}/agents`, { headers: SRC_JAR.header()? { cookie: SRC_JAR.header() } : undefined })
    if(r.ok){
      const j = await r.json().catch(()=> null)
      if(j && Array.isArray(j.agents)) return j.agents
    }
  }catch{}
  // Fallback: /api/v2/agents (name:string)
  try{
    if(SRC_SITE_PW) await sourceLoginIfNeeded(base)
    const r = await fetch(`${base}/v2/agents`, { headers: SRC_JAR.header()? { cookie: SRC_JAR.header() } : undefined })
    if(r.ok){
      const j = await r.json().catch(()=> null)
      if(j && Array.isArray(j.agents)){
        return j.agents.map(a=>{
          const name = String(a.name||'').trim()
          const parts = name.split(' ')
          return { id: a.id, firstName: parts[0]||name, lastName: parts.slice(1).join(' ')||'' }
        })
      }
    }
  }catch{}
  return null
}

function displayName(agent){ return `${(agent.firstName||'').trim()} ${(agent.lastName||'').trim()}`.trim() }
function canonicalName(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim() }

function buildAgentNameIndex(agents){
  const byFull = new Map()
  const byFirst = new Map() // only when unique
  const byLast = new Map()  // only when unique
  const byFirstLastInitial = new Map() // "Ada L"
  const byFirstInitialLast = new Map() // "A Lovelace"
  const firstCounts = new Map()
  const lastCounts = new Map()
  for(const a of agents){
    const full = displayName(a)
    const can = canonicalName(full)
    if(can) byFull.set(can, a.id)
    const f = String(a.firstName||'').trim()
    const l = String(a.lastName||'').trim()
    if(f) firstCounts.set(f.toLowerCase(), (firstCounts.get(f.toLowerCase())||0)+1)
    if(l) lastCounts.set(l.toLowerCase(), (lastCounts.get(l.toLowerCase())||0)+1)
  }
  for(const a of agents){
    const f = String(a.firstName||'').trim()
    const l = String(a.lastName||'').trim()
    if(f && (firstCounts.get(f.toLowerCase())===1)) byFirst.set(f.toLowerCase(), a.id)
    if(l && (lastCounts.get(l.toLowerCase())===1)) byLast.set(l.toLowerCase(), a.id)
    if(f && l){
      const fl = canonicalName(`${f} ${l[0]}`)
      const il = canonicalName(`${f[0]} ${l}`)
      if(!byFirstLastInitial.has(fl)) byFirstLastInitial.set(fl, a.id)
      if(!byFirstInitialLast.has(il)) byFirstInitialLast.set(il, a.id)
    }
  }
  return { byFull, byFirst, byLast, byFirstLastInitial, byFirstInitialLast }
}

function findAgentIdByName(name, idx){
  const raw = String(name||'').trim()
  if(!raw) return null
  const can = canonicalName(raw)
  if(idx.byFull.has(can)) return idx.byFull.get(can)
  // Try simple patterns like "Ada L" or "A Lovelace"
  if(idx.byFirstLastInitial.has(can)) return idx.byFirstLastInitial.get(can)
  if(idx.byFirstInitialLast.has(can)) return idx.byFirstInitialLast.get(can)
  // Try single-token unique first/last name
  const parts = can.split(' ')
  if(parts.length===1){
    const t = parts[0]
    if(idx.byFirst.has(t)) return idx.byFirst.get(t)
    if(idx.byLast.has(t)) return idx.byLast.get(t)
  }
  return null
}

function enrichWithAgents(doc, agents){
  if(!agents || agents.length===0) return doc
  const byId = new Map()
  for(const a of agents){ if(a && a.id){ byId.set(String(a.id), a) } }
  const idToName = new Map()
  for(const [id,a] of byId){ idToName.set(id, displayName(a)) }
  const idx = buildAgentNameIndex(agents)
  // Clone and update person fields when agentId present
  const next = JSON.parse(JSON.stringify(doc))
  let mapped = 0
  let inferred = 0
  if(Array.isArray(next.shifts)){
    for(const s of next.shifts){
      if(!s) continue
      if(s.agentId && idToName.has(s.agentId)){ s.person = idToName.get(s.agentId); mapped++ }
      else if(!s.agentId && s.person){ const id=findAgentIdByName(s.person, idx); if(id){ s.agentId=id; s.person = idToName.get(id)||s.person; inferred++ } }
    }
  }
  if(Array.isArray(next.pto)){
    for(const p of next.pto){
      if(!p) continue
      if(p.agentId && idToName.has(p.agentId)){ p.person = idToName.get(p.agentId); mapped++ }
      else if(!p.agentId && p.person){ const id=findAgentIdByName(p.person, idx); if(id){ p.agentId=id; p.person = idToName.get(id)||p.person; inferred++ } }
    }
  }
  if(Array.isArray(next.calendarSegs)){
    for(const c of next.calendarSegs){
      if(!c) continue
      if(c.agentId && idToName.has(c.agentId)){ c.person = idToName.get(c.agentId); mapped++ }
      else if(!c.agentId && c.person){ const id=findAgentIdByName(c.person, idx); if(id){ c.agentId=id; c.person = idToName.get(id)||c.person; inferred++ } }
    }
  }
  // Ensure agents[] and agentsIndex
  next.agents = agents
  const indexObj = {}
  for(const a of agents){ const full = displayName(a).toLowerCase(); if(full) indexObj[full] = a.id }
  next.agentsIndex = indexObj
  if(process.env.DEBUG==='1'){
    console.log(`[seed] name mapping: direct=${mapped}, inferred=${inferred}`)
  }
  return next
}

async function seedDest(doc){
  const jar = new CookieJar()
  let authHeaders = {}
  if(DEV_BEARER){
    authHeaders = { authorization: `Bearer ${DEV_BEARER}` }
  }else{
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
    authHeaders = { 'x-csrf-token': csrf, cookie: jar.header() }
  }

  // Try to enrich with agents catalog from source to replace placeholder names
  let payload = { ...doc, updatedAt: nowIso() }
  try{
    const agents = await fetchSourceAgents()
    if(Array.isArray(agents) && agents.length>0){
      payload = enrichWithAgents(payload, agents)
      payload.updatedAt = nowIso()
    }
  }catch{}
  const res = await fetch(`${DEST_API}/schedule?force=1`,{
    method:'POST',
    headers:{ 'content-type':'application/json', ...authHeaders },
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
  try{
    const r = await fetch(`${DEST_API}/schedule`)
    const j = await r.json()
    console.log(`[seed] Dest now: shifts=${(j.shifts||[]).length}, pto=${(j.pto||[]).length}, calSegs=${(j.calendarSegs||[]).length||0}, agents=${(j.agents||[]).length||0}`)
  }catch{}
  console.log('[seed] Wrote to local Worker OK')
}

main().catch(err=>{ console.error('[seed] ERROR:', err?.message || String(err)); process.exit(1) })
