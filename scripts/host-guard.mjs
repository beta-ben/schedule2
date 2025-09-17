#!/usr/bin/env node
// Host Guard
// Fails if forbidden host/port substrings appear in source or built output.
// Primary goal: permanently prevent reintroduction of localhost port 8787 (legacy proxy).
// Extend FORBIDDEN array as needed.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

const allowLocalhost = ['1','true','yes'].includes(String(process.env.HOST_GUARD_ALLOW_LOCALHOST||'').toLowerCase())
if(allowLocalhost){
  console.warn('[host-guard] Allowing localhost references via HOST_GUARD_ALLOW_LOCALHOST')
  process.exit(0)
}

const ROOT = process.cwd()
const LEGACY_HOST = 'localhost'
const LEGACY_PORT = '8787'
const LEGACY_TARGET = `${LEGACY_HOST}:${LEGACY_PORT}`
const FORBIDDEN = [
  LEGACY_TARGET,
  `http://${LEGACY_TARGET}`,
  `https://${LEGACY_TARGET}`
]
const SCAN_DIRS = ['src', 'public', 'scripts', 'dist']
const TEXT_EXT = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.html','.css','.md'])

const offenders = []

function scanPath(p){
  let st
  try{ st = statSync(p) }catch{ return }
  if(st.isDirectory()){
    for(const entry of readdirSync(p)){
      if(entry === 'node_modules' || entry.startsWith('.')) continue
      scanPath(join(p, entry))
    }
    return
  }
  if(!TEXT_EXT.has(extname(p))) return
  let content
  try{ content = readFileSync(p, 'utf8') }catch{ return }
  for(const bad of FORBIDDEN){
    const idx = content.indexOf(bad)
    if(idx !== -1){
      const preview = content.slice(Math.max(0, idx-30), idx+bad.length+30).replace(/\n/g,' ')
      offenders.push({ file: p.replace(ROOT+"/", ''), match: bad, snippet: preview })
    }
  }
}

for(const dir of SCAN_DIRS){ scanPath(join(ROOT, dir)) }

if(offenders.length){
  console.error('\n[host-guard] Forbidden host references found:')
  for(const o of offenders){
    console.error(` - ${o.file}: '${o.match}' -> ...${o.snippet}...`)
  }
  console.error('\n[host-guard] FAIL')
  process.exit(1)
}
console.log('[host-guard] OK: no forbidden hosts detected')
