#!/usr/bin/env node
/**
 * Dev Doctor
 * Quick diagnostics to reduce friction starting the app.
 * Checks:
 *  - Node version
 *  - Port usage (5173 web, 5174 worker)
 *  - Node version
 *  (Legacy dev-server removed; no proxy env checks.)
 */
import fs from 'fs'
import { createConnection } from 'net'
import path from 'path'

const MIN_NODE_MAJOR = 18
function log(msg){ console.log(msg) }
function warn(msg){ console.warn('\u26A0\uFE0F  '+msg) }

function checkNode(){
  const major = parseInt(process.versions.node.split('.')[0],10)
  if(major < MIN_NODE_MAJOR){ warn(`Node ${process.versions.node} < ${MIN_NODE_MAJOR}. Upgrade recommended.`) }
  else log(`Node version OK (${process.versions.node})`)
}

function checkEnv(){ log('No dev-server env required.') }

function checkPort(port){
  return new Promise(resolve => {
    const sock = createConnection({ port, host:'127.0.0.1' })
    let inUse = false
    sock.on('connect',()=>{ inUse = true; sock.destroy() })
    sock.on('error',()=>{ inUse = false })
    sock.on('close',()=> resolve({ port, inUse }))
    setTimeout(()=>{ try{ sock.destroy() }catch{} }, 800)
  })
}

async function main(){
  log('Running dev doctor...')
  checkNode()
  checkEnv()
  const ports = [5173, 5174]
  const results = await Promise.all(ports.map(p=>checkPort(p)))
  for(const r of results){
    log(`Port ${r.port}: ${r.inUse ? 'IN USE' : 'free'}`)
  }
  const api = results.find(r=>r.port===5174)
  if(!api?.inUse){ warn('Worker (wrangler dev) not detected on 5174 – API calls will fail.') }
  log('Done.')
}

main().catch(e=>{ warn('Dev doctor failed: '+(e?.message||e)) })
