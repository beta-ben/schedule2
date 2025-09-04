#!/usr/bin/env node
// Seed Cloudflare Workers KV with schedule.json from a local source file.
// Requirements (env):
//   CF_API_TOKEN   - Cloudflare API token with Workers KV Storage:Edit permission
//   CF_ACCOUNT_ID  - Cloudflare Account ID
//   CF_NAMESPACE_ID- KV Namespace ID to write to (the one bound as SCHEDULE_KV)
// Optional (env):
//   KEY            - KV key name (default: schedule.json)
//   SOURCE         - Path to local JSON file; if omitted, uses latest dev backup
//   DRY_RUN=true   - Validate and show summary without uploading
// Usage:
//   npm run kv:seed  # after exporting the required env vars

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function fail(msg){ console.error(`[kv:seed] FAIL: ${msg}`); process.exit(1) }
function warn(msg){ console.warn(`[kv:seed] WARN: ${msg}`) }
function ok(msg){ console.log(`[kv:seed] ${msg}`) }

function latestBackup(){
  const dir = path.resolve(__dirname, '../dev-server/dev-server/backups')
  if(!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter(f=>f.startsWith('data.') && f.endsWith('.json'))
  if(files.length===0) return null
  files.sort() // ISO-ish timestamps sort lexicographically
  return path.join(dir, files[files.length-1])
}

function summarize(doc){
  const agents = Array.isArray(doc?.agents) ? doc.agents.length : 0
  const shifts = Array.isArray(doc?.shifts) ? doc.shifts.length : 0
  const pto = Array.isArray(doc?.pto) ? doc.pto.length : 0
  const calendarSegs = Array.isArray(doc?.calendarSegs) ? doc.calendarSegs.length : 0
  return { agents, shifts, pto, calendarSegs, schemaVersion: doc?.schemaVersion, updatedAt: doc?.updatedAt }
}

async function main(){
  const token = process.env.CF_API_TOKEN
  const accountId = process.env.CF_ACCOUNT_ID
  const namespaceId = process.env.CF_NAMESPACE_ID
  const key = process.env.KEY || 'schedule.json'
  const dryRun = String(process.env.DRY_RUN||'').toLowerCase()==='true'

  let source = process.env.SOURCE
  if(!source){
    const guess = latestBackup()
    if(guess){
      source = guess
      ok(`SOURCE not provided; using latest backup: ${source}`)
    }
  }
  if(!source) fail('SOURCE not provided and no backups found. Set SOURCE=/path/to/schedule.json')
  if(!fs.existsSync(source)) fail(`SOURCE not found: ${source}`)

  const raw = fs.readFileSync(source, 'utf8')
  let json
  try{ json = JSON.parse(raw) }catch(e){ fail(`Invalid JSON in ${source}: ${e?.message||e}`) }

  // Minimal shape validation
  if(typeof json !== 'object' || json===null) fail('Top-level JSON must be an object')
  if(!Number.isFinite(Number(json.schemaVersion))) warn('schemaVersion missing or not a number')
  if(!Array.isArray(json.shifts)) warn('shifts is not an array')
  if(!Array.isArray(json.pto)) warn('pto is not an array')

  const sum = summarize(json)
  ok(`Ready to upload key=${key} from ${path.basename(source)}: ` + JSON.stringify(sum))

  if(dryRun){ ok('DRY_RUN=true set; skipping upload.'); return }

  if(!token || !accountId || !namespaceId){
    fail('CF_API_TOKEN, CF_ACCOUNT_ID, and CF_NAMESPACE_ID env vars are required to upload')
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(json)
  })
  const text = await res.text()
  if(!res.ok){
    fail(`Upload failed: ${res.status} ${res.statusText} -> ${text}`)
  }
  ok(`Upload OK: ${text}`)
}

main().catch(err=> fail(err?.message||String(err)))
