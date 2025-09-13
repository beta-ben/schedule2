#!/usr/bin/env node
// Dev convenience: request a magic link and open it in your browser.
// Usage:
//   node scripts/dev-magic-login.mjs you@company.com
// or set DEV_LOGIN_EMAIL and run: npm run dev:login

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

let EMAIL = (process.argv[2] || process.env.DEV_LOGIN_EMAIL || '').trim()
if(!EMAIL){
  try{
    const p = path.join(process.cwd(), 'team-schedule-api/.dev.vars')
    if(fs.existsSync(p)){
      const raw = fs.readFileSync(p, 'utf8')
      const m = raw.match(/^DEV_LOGIN_EMAIL\s*=\s*"?([^\r\n"]+)"?/m)
      if(m) EMAIL = (m[1]||'').trim()
    }
  }catch{}
}
if(!EMAIL){
  console.error('[dev:login] Provide an email:')
  console.error('  - node scripts/dev-magic-login.mjs you@company.com')
  console.error('  - or set DEV_LOGIN_EMAIL env')
  console.error('  - or set DEV_LOGIN_EMAIL in team-schedule-api/.dev.vars')
  process.exit(1)
}

const API_BASE = (process.env.DEV_API_BASE || 'http://localhost:8787').replace(/\/$/,'')
// Try to read APP_REDIRECT_BASE from .dev.vars; fallback to localhost:5173
let APP_BASE = process.env.APP_REDIRECT_BASE || ''
try{
  if(!APP_BASE){
    const p = path.join(process.cwd(), 'team-schedule-api/.dev.vars')
    if(fs.existsSync(p)){
      const raw = fs.readFileSync(p, 'utf8')
      const m = raw.match(/^APP_REDIRECT_BASE\s*=\s*"?([^\r\n"]+)"?/m)
      if(m) APP_BASE = m[1]
    }
  }
}catch{}
if(!APP_BASE) APP_BASE = 'http://localhost:5173'

function openUrl(url){
  try{
    if(process.platform === 'darwin') execSync(`open '${url.replace(/'/g,"'\\''")}'`)
    else if(process.platform === 'win32') execSync(`start "" "${url}"`, { shell: 'cmd.exe' })
    else execSync(`xdg-open '${url.replace(/'/g,"'\\''")}'`)
    console.log('[dev:login] Opened:', url)
  }catch{ console.log('[dev:login] Open this URL in your browser:', url) }
}

async function main(){
  console.log(`[dev:login] Requesting link for ${EMAIL} ...`)
  const r = await fetch(`${API_BASE}/api/login-magic/request`,{
    method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ email: EMAIL, role:'admin' })
  })
  let link
  try{ const j = await r.clone().json(); link = j?.link }catch{}
  if(r.ok && link){
    // Ensure we redirect back to app if backend hasn't been configured
    const url = new URL(link)
    if(!url.searchParams.get('r')) url.searchParams.set('r', APP_BASE)
    openUrl(url.toString())
    return
  }
  if(!r.ok){
    const text = await r.text().catch(()=> '')
    console.error(`[dev:login] Request failed: ${r.status} ${text}`)
    process.exit(1)
  }
  console.log('[dev:login] No link in response. If this is dev, set MAGIC_ECHO_DEV="true" in team-schedule-api/.dev.vars and restart `npm run dev`.')
  console.log('Alternatively, check email provider env (RESEND_API_KEY, MAGIC_FROM_EMAIL) for real email delivery.')
}

main().catch(e=>{ console.error('[dev:login] ERROR', e?.message || e); process.exit(1) })
