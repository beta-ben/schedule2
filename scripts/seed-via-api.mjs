#!/usr/bin/env node
// Seed the live Worker API with a full schedule document using admin login.
// This path avoids Cloudflare API credentials and uses the Worker auth you already have.
//
// Env:
//   ADMIN_PASSWORD     - required, the admin password for /api/login
//   API_BASE           - optional, defaults to https://team-schedule-api.phorbie.workers.dev
//   SOURCE             - optional, path to JSON file OR 'cloud' OR a full http(s) URL
//                        - if 'cloud' or a URL, the script will fetch the JSON (cloud uses `${API_BASE}/api/schedule`)
//                        - if omitted, defaults to latest dev backup file
// Usage:
//   npm run seed:api  # ensure ADMIN_PASSWORD is exported

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function fail(msg){ console.error(`[seed:api] FAIL: ${msg}`); process.exit(1) }
function warn(msg){ console.warn(`[seed:api] WARN: ${msg}`) }
function ok(msg){ console.log(`[seed:api] ${msg}`) }

function latestBackup(){
  const dir = path.resolve(__dirname, '../dev-server/dev-server/backups')
  if(!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f=>f.startsWith('data.') && f.endsWith('.json'))
  if(files.length===0) return null
  files.sort() // lexicographic timestamp
  return path.join(dir, files[files.length-1])
}

function fullName(a){
  const f = (a?.firstName||'').trim()
  const l = (a?.lastName||'').trim()
  return (f && l) ? `${f} ${l}` : (f || l)
}

function normalizeNamesAndIds(doc){
  if(!doc || typeof doc !== 'object') return doc
  const agents = Array.isArray(doc.agents) ? doc.agents : []
  const shifts = Array.isArray(doc.shifts) ? doc.shifts : []
  const pto = Array.isArray(doc.pto) ? doc.pto : []
  const cal = Array.isArray(doc.calendarSegs) ? doc.calendarSegs : []
  const index = (doc.agentsIndex && typeof doc.agentsIndex==='object') ? doc.agentsIndex : {}

  // Build maps
  const idToName = new Map()
  const nameToId = new Map()
  for(const a of agents){
    if(!a || !a.id) continue
    const name = fullName(a)
    if(name){
      idToName.set(a.id, name)
      nameToId.set(name.trim().toLowerCase(), a.id)
    }
  }
  for(const [k,v] of Object.entries(index)){
    if(typeof v === 'string') nameToId.set(String(k).trim().toLowerCase(), v)
  }

  const fillId = (person)=>{ const key=(person||'').trim().toLowerCase(); return nameToId.get(key) }
  const nameFor = (id)=> idToName.get(id)

  const fixOne = (rec)=>{
    if(!rec || typeof rec !== 'object') return
    if(!rec.agentId){
      const id = fillId(rec.person)
      if(id) rec.agentId = id
    }
    if(rec.agentId){
      const nm = nameFor(rec.agentId)
      if(nm && typeof rec.person === 'string'){
        const cur = rec.person.trim()
        if(cur.toLowerCase() !== nm.trim().toLowerCase()){
          rec.person = nm
        }
      }else if(nm){
        rec.person = nm
      }
    }
  }

  for(const s of shifts) fixOne(s)
  for(const p of pto) fixOne(p)
  for(const c of cal) fixOne(c)

  // Rebuild agentsIndex from agents (prefer real names)
  const newIdx = {}
  for(const a of agents){ const nm = fullName(a)?.trim().toLowerCase(); if(nm && a.id) newIdx[nm] = a.id }
  doc.agentsIndex = newIdx
  return doc
}

async function readSourceToDoc(source, apiBase){
  if(/^https?:\/\//i.test(source)){
    const r = await fetch(source)
    if(!r.ok){ fail(`Fetch SOURCE failed: ${r.status} ${r.statusText}`) }
    return await r.json()
  }
  if(source === 'cloud'){
    const url = `${apiBase.replace(/\/$/, '')}/api/schedule`
    const r = await fetch(url)
    const text = await r.text()
    if(!r.ok){ fail(`Fetch from cloud failed: ${r.status} ${r.statusText} -> ${text}`) }
    try{ return JSON.parse(text) }catch(e){ fail('Cloud response is not JSON') }
  }
  if(!fs.existsSync(source)) fail(`SOURCE not found: ${source}`)
  let raw = fs.readFileSync(source, 'utf8')
  try{ return JSON.parse(raw) }catch(e){ fail(`Invalid JSON in ${source}: ${e?.message||e}`) }
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
  const headers = {
    'content-type': 'application/json',
    'x-csrf-token': csrf,
    'x-session-id': sid,
    'authorization': `Session ${sid}`,
  }
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
  if(!ADMIN_PASSWORD) fail('ADMIN_PASSWORD env var is required')

  let source = process.env.SOURCE
  if(!source){
    const guess = latestBackup()
    if(guess){ source = guess; ok(`SOURCE not provided; using latest backup: ${source}`) }
  }
  if(!source) fail('No SOURCE specified and no backups found. Set SOURCE=/path/to/schedule.json or SOURCE=cloud')

  let doc = await readSourceToDoc(source, API_BASE)
  if(typeof doc !== 'object' || doc===null) fail('Top-level JSON must be an object')
  if(!Array.isArray(doc.shifts)) warn('shifts missing or not an array')
  if(!Array.isArray(doc.pto)) warn('pto missing or not an array')
  if(!Number.isFinite(Number(doc.schemaVersion))){ warn('schemaVersion missing; defaulting to 2'); doc.schemaVersion = 2 }

  // Optional migration: rewrite placeholder names from agentId and fill missing ids
  const MIGRATE = String(process.env.MIGRATE_NAMES||'true').toLowerCase() !== 'false'
  if(MIGRATE){
    doc = normalizeNamesAndIds(doc)
  }

  // Always advance updatedAt to avoid conflict against any placeholder data
  doc.updatedAt = new Date().toISOString()
  const sum = summarize(doc)
  ok(`Seeding to ${API_BASE} with: ` + JSON.stringify(sum))

  const { csrf, sid } = await login(API_BASE, ADMIN_PASSWORD)
  ok('Logged in; obtained sid and csrf')
  await putSchedule(API_BASE, sid, csrf, doc)
}

main().catch(err=> fail(err?.message||String(err)))
