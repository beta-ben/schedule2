#!/usr/bin/env node
// Fetch a key (default schedule.json) from Cloudflare Workers KV and print to stdout.
// Requirements (env): CF_API_TOKEN, CF_ACCOUNT_ID, CF_NAMESPACE_ID
// Optional: KEY (default: schedule.json), OUT=file.json to write to a file.

function fail(msg){ console.error(`[kv:get] FAIL: ${msg}`); process.exit(1) }
function ok(msg){ console.log(`[kv:get] ${msg}`) }

const token = process.env.CF_API_TOKEN
const accountId = process.env.CF_ACCOUNT_ID
const namespaceId = process.env.CF_NAMESPACE_ID
const key = process.env.KEY || 'schedule.json'
const out = process.env.OUT

async function main(){
  if(!token || !accountId || !namespaceId){
    fail('CF_API_TOKEN, CF_ACCOUNT_ID, CF_NAMESPACE_ID env vars are required')
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
  if(res.status === 404){
    fail(`Key not found: ${key}`)
  }
  const text = await res.text()
  if(!res.ok){ fail(`Fetch failed: ${res.status} ${res.statusText} -> ${text}`) }
  try{ JSON.parse(text) }catch{ ok('Note: value is not valid JSON') }
  if(out){
    const fs = await import('node:fs')
    fs.writeFileSync(out, text)
    ok(`Wrote ${text.length} bytes to ${out}`)
  }else{
    process.stdout.write(text)
  }
}

main().catch(err=> fail(err?.message||String(err)))
