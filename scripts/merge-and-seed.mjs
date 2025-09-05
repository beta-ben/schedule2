#!/usr/bin/env node
// Merge real shifts (from a URL or file) with agents/PTO/calendarSegs from another source,
// normalize names/ids, and seed the Worker via admin login.
// Env:
//   ADMIN_PASSWORD   - required
//   API_BASE         - default https://team-schedule-api.phorbie.workers.dev
//   SHIFT_SOURCE     - required (URL or file) providing { shifts: [...] }
//   META_SOURCE      - required (URL or file) providing { agents, pto, calendarSegs }
//   MIGRATE_NAMES    - default true, normalize names from agentId + rebuild agentsIndex

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function fail(msg){ console.error(`[seed:merge] FAIL: ${msg}`); process.exit(1) }
function ok(msg){ console.log(`[seed:merge] ${msg}`) }

async function readSource(src){
  if(/^https?:\/\//i.test(src)){
    const r = await fetch(src)
    const t = await r.text()
    if(!r.ok){ fail(`Fetch ${src} failed: ${r.status} ${r.statusText} -> ${t}`) }
    try{ return JSON.parse(t) }catch(e){ fail(`Invalid JSON from ${src}: ${e?.message||e}`) }
  }
  const p = path.resolve(src)
  if(!fs.existsSync(p)) fail(`File not found: ${p}`)
  try{ return JSON.parse(fs.readFileSync(p,'utf8')) }catch(e){ fail(`Invalid JSON in ${p}: ${e?.message||e}`) }
}

function fullName(a){
  const f=(a?.firstName||'').trim(), l=(a?.lastName||'').trim()
  return (f && l)? `${f} ${l}` : (f||l)
}

function normalize(doc){
  if(!doc || typeof doc!=='object') return doc
  const agents = Array.isArray(doc.agents)? doc.agents : []
  const shifts = Array.isArray(doc.shifts)? doc.shifts : []
  const pto = Array.isArray(doc.pto)? doc.pto : []
  const cal = Array.isArray(doc.calendarSegs)? doc.calendarSegs : []
  const idxIn = (doc.agentsIndex && typeof doc.agentsIndex==='object')? doc.agentsIndex : {}

  const idToName = new Map()
  const nameToId = new Map()
  for(const a of agents){ if(a?.id){ const nm=fullName(a); if(nm){ idToName.set(a.id, nm); nameToId.set(nm.trim().toLowerCase(), a.id) } } }
  for(const [k,v] of Object.entries(idxIn)){ if(typeof v==='string'){ nameToId.set(String(k).trim().toLowerCase(), v) } }

  const fillId=(person)=> nameToId.get((person||'').trim().toLowerCase())
  const nameFor=(id)=> idToName.get(id)

  const fix=(rec)=>{
    if(!rec || typeof rec!=='object') return
    if(!rec.agentId){ const id=fillId(rec.person); if(id) rec.agentId=id }
    if(rec.agentId){ const nm=nameFor(rec.agentId); if(nm){ const cur=(rec.person||'').trim(); if(cur.toLowerCase()!==nm.toLowerCase()) rec.person=nm } }
  }
  for(const s of shifts) fix(s)
  for(const p of pto) fix(p)
  for(const c of cal) fix(c)

  const idx={}
  const add=(name,id)=>{ const k=(name||'').trim().toLowerCase(); if(k && id) idx[k]=id }
  for(const s of shifts){ if(s.agentId) add(s.person, s.agentId) }
  for(const p of pto){ if(p.agentId) add(p.person, p.agentId) }
  for(const c of cal){ if(c.agentId) add(c.person, c.agentId) }
  for(const a of agents){ const nm=fullName(a); if(nm && a.id && !idx[nm.trim().toLowerCase()]) idx[nm.trim().toLowerCase()]=a.id }
  doc.agentsIndex = idx
  return doc
}

async function login(base, password){
  const url = `${base.replace(/\/$/, '')}/api/login`
  const res = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ password }) })
  const text = await res.text()
  if(!res.ok){ fail(`Login failed: HTTP ${res.status} ${res.statusText} -> ${text}`) }
  let j; try{ j = JSON.parse(text) }catch{ fail('Login did not return JSON') }
  if(!j?.csrf || !j?.sid){ fail('Login missing csrf or sid in response') }
  return { csrf: j.csrf, sid: j.sid }
}
async function putSchedule(base, sid, csrf, doc){
  const url = `${base.replace(/\/$/, '')}/api/schedule`
  const headers = { 'content-type':'application/json', 'x-csrf-token': csrf, 'x-session-id': sid, 'authorization': `Session ${sid}` }
  const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(doc) })
  const text = await res.text()
  if(!res.ok){ fail(`Upload failed: HTTP ${res.status} ${res.statusText} -> ${text}`) }
  let j; try{ j = JSON.parse(text) }catch{ fail('Upload did not return JSON') }
  if(!j?.ok){ fail(`Upload response not ok: ${text}`) }
  ok(`Upload OK. updatedAt=${j.updatedAt || doc.updatedAt}`)
}

function summarize(doc){
  const agents = Array.isArray(doc?.agents) ? doc.agents.length : 0
  const shifts = Array.isArray(doc?.shifts) ? doc.shifts.length : 0
  const pto = Array.isArray(doc?.pto) ? doc.pto.length : 0
  const calendarSegs = Array.isArray(doc?.calendarSegs) ? doc.calendarSegs.length : 0
  return { agents, shifts, pto, calendarSegs, schemaVersion: doc?.schemaVersion, updatedAt: doc?.updatedAt }
}

async function main(){
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
  const API_BASE = process.env.API_BASE || 'https://team-schedule-api.phorbie.workers.dev'
  const SHIFT_SOURCE = process.env.SHIFT_SOURCE
  const META_SOURCE = process.env.META_SOURCE
  const MIGRATE = String(process.env.MIGRATE_NAMES||'true').toLowerCase() !== 'false'
  if(!ADMIN_PASSWORD) fail('ADMIN_PASSWORD required')
  if(!SHIFT_SOURCE || !META_SOURCE) fail('SHIFT_SOURCE and META_SOURCE are required')

  const shiftDoc = await readSource(SHIFT_SOURCE)
  const metaDoc = await readSource(META_SOURCE)

  const merged = {
    schemaVersion: 2,
    agents: Array.isArray(metaDoc.agents) ? metaDoc.agents : [],
    shifts: Array.isArray(shiftDoc.shifts) ? shiftDoc.shifts : [],
    pto: Array.isArray(metaDoc.pto) ? metaDoc.pto : [],
    calendarSegs: Array.isArray(metaDoc.calendarSegs) ? metaDoc.calendarSegs : [],
    agentsIndex: metaDoc.agentsIndex || {},
    updatedAt: new Date().toISOString(),
  }

  const finalDoc = MIGRATE ? normalize(merged) : merged
  ok('Prepared doc: ' + JSON.stringify(summarize(finalDoc)))

  const { csrf, sid } = await login(API_BASE, ADMIN_PASSWORD)
  ok('Logged in; obtained sid and csrf')
  await putSchedule(API_BASE, sid, csrf, finalDoc)
}

main().catch(err=> fail(err?.message||String(err)))
