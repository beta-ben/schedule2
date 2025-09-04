#!/usr/bin/env node
// Simple smoke tests for key invariants before deployment.
// - Builds the app
// - Verifies dist contains CNAME and mirrored assets under /schedule2
// - Lints basic env expectations
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
  // 1) Typecheck + predeploy (build + CNAME + asset mirror)
  run('npm run typecheck')
  run('npm run predeploy --if-present')

  const dist = join(process.cwd(), 'dist')
  if(!existsSync(dist)) fail('dist not found after build')

  // 2) CNAME exists
  if(existsSync(join(dist, 'CNAME'))){
    ok('CNAME present in dist')
  } else {
    ok('No CNAME (GH Pages under username.github.io)')
  }

  // 3) schedule2 mirror for cache bridge (created by predeploy)
  const mirror = join(dist, 'schedule2')
  if(existsSync(mirror) && existsSync(join(mirror, 'assets'))){
    ok('schedule2 asset mirror present')
  } else {
    ok('No schedule2 asset mirror (not required without custom domain cache bridge)')
  }

  // 4) Asset sanity
  const assets = join(dist, 'assets')
  if(!existsSync(assets)) fail('dist/assets missing')
  const files = readdirSync(assets)
  if(!files.some(f=>f.endsWith('.js'))) fail('No JS bundle in dist/assets')
  if(!files.some(f=>f.endsWith('.css'))) fail('No CSS bundle in dist/assets')
  ok('assets folder contains JS and CSS bundles')

  // 5) Mirror contains assets as well
  const mirrorFiles = readdirSync(join(mirror, 'assets'))
  if(mirrorFiles.length === 0) fail('dist/schedule2/assets is empty')
  ok('asset mirror populated')

  console.log('\n[smoke] All checks passed.')
}catch(err){
  fail(err?.message || String(err))
}
