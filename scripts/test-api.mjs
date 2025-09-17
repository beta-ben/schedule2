#!/usr/bin/env node
// Minimal local API contract test (expects `npm run dev` running on :8787)
// - Uses dev bearer if available in .dev.vars or env

import fs from 'fs'
import path from 'path'

const BASE = (process.env.DEST_BASE || `http://${['localhost','8787'].join(':')}`).replace(/\/$/,'')
const API = `${BASE}/api`

let BEARER = process.env.DEV_BEARER_TOKEN || ''
try{
  if(!BEARER){
    const p = path.join(process.cwd(), 'team-schedule-api/.dev.vars')
    if(fs.existsSync(p)){
      const raw = fs.readFileSync(p, 'utf8')
      const m = raw.match(/^DEV_BEARER_TOKEN\s*=\s*"?([^\r\n"]+)"?/m)
      if(m) BEARER = m[1]
    }
  }
}catch{}

function auth(){ const h = {}; if(BEARER) h['authorization'] = `Bearer ${BEARER}`; return h }
async function json(r){ const t = await r.text(); try{ return JSON.parse(t) }catch{ throw new Error(`Non-JSON: ${t.slice(0,200)}`) } }
function nowIso(){ return new Date().toISOString() }

async function main(){
  let fail = (msg)=>{ console.error(`[test] FAIL: ${msg}`); process.exit(1) }
  let ok = (msg)=> console.log(`[test] OK: ${msg}`)

  // Health
  let r = await fetch(`${API}/_health`)
  if(!r.ok) fail(`_health ${r.status}`)
  const h = await json(r)
  ok(`health: d1=${h?.d1?.ok}, use_d1=${h?.use_d1}`)

  // Upsert agent
  r = await fetch(`${API}/v2/agents`,{ method:'PATCH', headers: { 'content-type':'application/json', ...auth() }, body: JSON.stringify({ agents: [{ id:'test-agent', firstName:'Test', lastName:'Agent' }] }) })
  if(!r.ok) fail(`v2 agents PATCH ${r.status}`)
  ok('agents upsert')

  // Upsert shift via v2 batch
  r = await fetch(`${API}/v2/shifts/batch`,{ method:'POST', headers: { 'content-type':'application/json', ...auth() }, body: JSON.stringify({ upserts: [{ id:'test-shift', person:'Test Agent', agentId:'test-agent', day:'Mon', start:'09:00', end:'17:00' }] }) })
  if(!r.ok) fail(`v2 shifts batch POST ${r.status}`)
  ok('shifts upsert')

  // Read schedule doc and expect presence
  r = await fetch(`${API}/schedule`)
  if(!r.ok) fail(`schedule GET ${r.status}`)
  const doc = await json(r)
  if(!Array.isArray(doc.shifts)) fail('schedule doc has no shifts array')
  ok(`schedule read: agents=${(doc.agents||[]).length}, shifts=${(doc.shifts||[]).length}`)

  // Cleanup (optional): delete test shift
  r = await fetch(`${API}/v2/shifts/batch`,{ method:'POST', headers: { 'content-type':'application/json', ...auth() }, body: JSON.stringify({ upserts: [], deletes: ['test-shift'] }) })
  if(!r.ok) fail(`v2 shifts batch delete ${r.status}`)
  ok('cleanup done')

  console.log('[test] All checks passed.')
}

main().catch(e=>{ console.error('[test] ERROR', e?.message || e); process.exit(1) })

