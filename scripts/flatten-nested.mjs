#!/usr/bin/env node
/**
 * flatten-nested.mjs
 * Safely flattens a duplicated nested project directory (e.g. ./schedule2 inside repo root).
 * - Detects a nested folder whose name matches the root package name or 'schedule2'.
 * - Copies only files that do NOT already exist at root.
 * - If a file exists with different content, records it in flatten-conflicts.txt (never overwrites).
 * - Skips node_modules, dist, coverage, .git, .DS_Store.
 * - Creates a timestamped backup tarball (if 'tar' available) before any changes.
 *
 * Usage:
 *   npm run flatten            (dry run + copy missing files)
 *   npm run flatten -- --delete  (after verifying, also remove the nested directory)
 *   npm run flatten -- --force-conflicts (also copy conflicting files with .nested suffix)
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'

const ROOT = process.cwd()
const PKG = JSON.parse(readFileSync(path.join(ROOT,'package.json'),'utf8'))
const candidateNames = new Set([ 'schedule2', PKG.name ].filter(Boolean))
const nestedDir = Array.from(candidateNames).find(n=> n && existsSync(path.join(ROOT,n)) && statSafe(path.join(ROOT,n))?.isDirectory())
if(!nestedDir){ console.log('✅ No nested duplicate folder detected. Nothing to do.'); process.exit(0) }

if(nestedDir === '.' || nestedDir === ''){ console.log('Refusing to operate on root.'); process.exit(1) }

const NESTED_PATH = path.join(ROOT, nestedDir)
if(!existsSync(path.join(NESTED_PATH,'package.json'))){
  console.log(`⚠️ Nested folder '${nestedDir}' does not look like a project (no package.json). Abort.`)
  process.exit(1)
}

const args = process.argv.slice(2)
const DO_DELETE = args.includes('--delete')
const FORCE_CONFLICTS = args.includes('--force-conflicts')

console.log(`🔍 Detected nested project folder: ./${nestedDir}`)

// Backup
try{
  const stamp = new Date().toISOString().replace(/[:.]/g,'-')
  const backupName = `flatten-backup-${nestedDir}-${stamp}.tar.gz`
  execSync(`tar -czf ${backupName} ${nestedDir}`, { cwd: ROOT })
  console.log(`🗃  Backup created: ${backupName}`)
}catch(e){ console.log('⚠️ Could not create tar backup (tar missing?); proceeding without tar.') }

const SKIP = new Set(['node_modules','dist','coverage','.git'])
const conflicts = []
const copied = []
const skippedExisting = []

walk(NESTED_PATH, (abs, rel)=>{
  const base = path.basename(abs)
  if(SKIP.has(base) || base === '.DS_Store') return
  const st = statSafe(abs)
  if(!st) return
  if(st.isDirectory()) return // handled by walk recursion
  const target = path.join(ROOT, rel)
  if(existsSync(target)){
    const a = readFileSync(abs)
    const b = readFileSync(target)
    if(Buffer.compare(a,b)!==0){
      conflicts.push(rel)
      if(FORCE_CONFLICTS){
        const forced = target + '.nested'
        writeFileSync(forced, a)
        console.log(`⚡ wrote conflicting file copy: ${forced}`)
      }else{
        skippedExisting.push(rel)
      }
    }
    return
  }
  // Ensure directory exists
  mkdirSync(path.dirname(target), { recursive:true })
  copyFileSync(abs, target)
  copied.push(rel)
})

if(conflicts.length){
  writeFileSync(path.join(ROOT,'flatten-conflicts.txt'), conflicts.map(c=>`CONFLICT ${c}`).join('\n')+'\n')
}

console.log(`✅ Copy complete. New files: ${copied.length}. Conflicts: ${conflicts.length}. Skipped existing identical/diff: ${skippedExisting.length}.`)
if(conflicts.length){ console.log('   See flatten-conflicts.txt for list. Resolve manually then re-run with --force-conflicts if desired.') }

if(DO_DELETE){
  if(conflicts.length && !FORCE_CONFLICTS){
    console.log('❌ Refusing to delete nested folder while conflicts remain (use --force-conflicts or resolve).')
  }else{
    rmSync(NESTED_PATH, { recursive:true, force:true })
    console.log(`🧹 Removed nested folder ./${nestedDir}`)
  }
}else{
  console.log('ℹ️  Nested folder retained. Run again with --delete after verifying results.')
}

function walk(dir, cb, prefix=''){
  const entries = readdirSync(dir)
  for(const e of entries){
    if(SKIP.has(e)) continue
    const abs = path.join(dir, e)
    const rel = path.join(prefix, e)
    const st = statSafe(abs)
    if(!st) continue
    if(st.isDirectory()) walk(abs, cb, rel)
    else cb(abs, rel)
  }
}
function statSafe(p){ try{ return statSync(p) }catch{ return null } }