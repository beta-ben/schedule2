#!/usr/bin/env node
// Seed the live Worker API with a full schedule document using admin login.
// This path avoids Cloudflare API credentials and uses the Worker auth you already have.
//
// Env:
//   ADMIN_PASSWORD     - required, the admin password for /api/login
//   API_BASE           - optional, defaults to https://team-schedule-api.phorbie.workers.dev
//   SOURCE             - optional, path to JSON file; defaults to latest dev backup
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
  if(!source) fail('No SOURCE specified and no backups found. Set SOURCE=/path/to/schedule.json')
  if(!fs.existsSync(source)) fail(`SOURCE not found: ${source}`)

  let raw = fs.readFileSync(source, 'utf8')
  let doc
  try{ doc = JSON.parse(raw) }catch(e){ fail(`Invalid JSON in ${source}: ${e?.message||e}`) }
  if(typeof doc !== 'object' || doc===null) fail('Top-level JSON must be an object')
  if(!Array.isArray(doc.shifts)) warn('shifts missing or not an array')
  if(!Array.isArray(doc.pto)) warn('pto missing or not an array')
  if(!Number.isFinite(Number(doc.schemaVersion))){ warn('schemaVersion missing; defaulting to 2'); doc.schemaVersion = 2 }

  // Always advance updatedAt to avoid conflict against any placeholder data
  doc.updatedAt = new Date().toISOString()
  const sum = summarize(doc)
  ok(`Seeding to ${API_BASE} with: ` + JSON.stringify(sum))

  const { csrf, sid } = await login(API_BASE, ADMIN_PASSWORD)
  ok('Logged in; obtained sid and csrf')
  await putSchedule(API_BASE, sid, csrf, doc)
}

main().catch(err=> fail(err?.message||String(err)))
