#!/usr/bin/env node
// Validate prod environment assumptions to reduce Dev→Prod surprises.
// - Ensures VITE_SCHEDULE_API_BASE is set (from env or .env.production)
// - Warns if it points to localhost
// - Prints quick curl commands to verify API cookies and CORS
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function warn(msg){ console.warn(`[validate:prod] WARN: ${msg}`) }
function ok(msg){ console.log(`[validate:prod] OK: ${msg}`) }
function fail(msg){ console.error(`[validate:prod] FAIL: ${msg}`); process.exit(1) }

try{
  // Prefer CI env var; fall back to .env.production if present
  let base = process.env.VITE_SCHEDULE_API_BASE
  if(!base){
    const envPath = join(process.cwd(), '.env.production')
    if(existsSync(envPath)){
      const raw = readFileSync(envPath, 'utf8')
      const lines = raw.split(/\r?\n/)
      const kv = Object.fromEntries(lines.map(l=>{ const m=l.match(/^([^#=]+)=(.*)$/); return m? [m[1].trim(), m[2].trim()]: null }).filter(Boolean))
      base = kv['VITE_SCHEDULE_API_BASE']
    }
  }
  if(!base) fail('VITE_SCHEDULE_API_BASE not provided via env or .env.production')
  ok(`VITE_SCHEDULE_API_BASE=${base}`)
  if(/localhost|127\.0\.0\.1/.test(base)) warn('API base appears to be localhost; production site cannot reach it.')

  // Health check (optional but recommended)
  const baseNoSlash = base.replace(/\/$/, '')
  const healthCandidates = [
    `${baseNoSlash}/health`,
    `${baseNoSlash}/api/_health`
  ]
  try{
    const ctrl = new AbortController()
    const t = setTimeout(()=>ctrl.abort(), 4000)
    let res
    let lastErr
    for(const url of healthCandidates){
      try{
        res = await fetch(url, { signal: ctrl.signal })
        if(res.ok || res.status!==404){
          break
        }
      }catch(e){ lastErr = e }
    }
    clearTimeout(t)
    if(!res || !res.ok) warn(`Health endpoint returned ${res?.status||'n/a'} (tried ${healthCandidates.join(', ')})`)
    else ok('Health endpoint responded OK')
  }catch(err){
    warn(`Health check failed: ${err?.message || String(err)} (add /health to your API for better CI catches)`) 
  }

  console.log('\nNext steps to verify API:')
  console.log(`1) Login: curl -i -X POST -H "content-type: application/json" --data "{\\"password\\":\\"<pw>\\"}" ${baseNoSlash}/api/login`)
  console.log('   - Expect Set-Cookie for sid and csrf; SameSite=Lax; Secure; Domain=.teamschedule.cc')
  console.log(`2) Read: curl -i -X GET --cookie "sid=<cookie>; csrf=<cookie>" ${baseNoSlash}/api/schedule`)
  console.log(`3) Write: curl -i -X POST -H "content-type: application/json" -H "x-csrf-token: <csrf>" --cookie "sid=<cookie>; csrf=<cookie>" --data "{\\"shifts\\":[],\\"pto\\":[],\\"updatedAt\\":\\"<iso>\\"}" ${baseNoSlash}/api/schedule`)
  console.log('\nIf any step fails due to CORS from the browser, ensure:')
  console.log('- Access-Control-Allow-Origin: https://teamschedule.cc')
  console.log('- Access-Control-Allow-Credentials: true')
  console.log('- Set-Cookie has Secure; HttpOnly; SameSite=Lax; Domain=.teamschedule.cc')
}catch(err){
  fail(err?.message || String(err))
}
