#!/usr/bin/env node
// Simple smoke tests for key invariants before deployment.
// - Builds the app
// - Asserts primary bundle files exist
// - Ensures generated assets include JS & CSS bundles
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function run(cmd){
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd(), env: process.env })
}

function fail(msg){ console.error(`\n[smoke] FAIL: ${msg}`); process.exit(1) }
function ok(msg){ console.log(`[smoke] OK: ${msg}`) }

try{
  // 1) Typecheck + build
  run('npm run typecheck')
  run('npm run build')

  const dist = join(process.cwd(), 'dist')
  if(!existsSync(dist)) fail('dist not found after build')

  // 2) HTML entry exists
  if(!existsSync(join(dist, 'index.html'))) fail('index.html missing in dist')
  ok('index.html present in dist')

  // 3) Asset sanity
  const assets = join(dist, 'assets')
  if(!existsSync(assets)) fail('dist/assets missing')
  const files = readdirSync(assets)
  if(!files.some(f=>f.endsWith('.js'))) fail('No JS bundle in dist/assets')
  if(!files.some(f=>f.endsWith('.css'))) fail('No CSS bundle in dist/assets')
  ok('assets folder contains JS and CSS bundles')

  // 4) Optional PWA artifacts
  if(existsSync(join(dist, 'sw.js'))) ok('service worker generated')

  console.log('\n[smoke] All checks passed.')
}catch(err){
  fail(err?.message || String(err))
}
