// Fetch live schedule JSON and write into local dev proxy data file
// Usage: node scripts/seed-from-cloud.mjs [optional-url]
// Env: SEED_URL can override the source URL

import fs from 'fs'
import path from 'path'

const url = process.argv[2] || process.env.SEED_URL || 'https://team-schedule-api.bsteward.workers.dev/v1/schedule'

async function main(){
  console.log(`Fetching ${url} ...`)
  const r = await fetch(url)
  if(!r.ok){
    throw new Error(`Fetch failed: ${r.status} ${r.statusText}`)
  }
  const text = await r.text()
  // Validate JSON
  try { JSON.parse(text) } catch (e) { throw new Error('Invalid JSON from source: ' + e.message) }

  const target = path.resolve('dev-server/dev-server/data.json')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target)){
    const bak = `${target}.bak.${Date.now()}`
    fs.copyFileSync(target, bak)
    console.log(`Backed up existing data to ${bak}`)
  }
  fs.writeFileSync(target, text)
  console.log(`Wrote ${text.length} bytes to ${target}`)
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
