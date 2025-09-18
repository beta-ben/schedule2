#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function run(step, command, args, options = {}){
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: options.cwd || root,
    env: process.env,
  })
  if(result.status !== 0){
    throw new Error(`${step} failed`)
  }
}

const cliArgs = process.argv.slice(2)
let specifiedEnv
const passthroughArgs = []
for(let i=0; i<cliArgs.length; i++){
  const arg = cliArgs[i]
  if(arg === '--env' || arg === '-e'){
    specifiedEnv = cliArgs[i+1] ?? ''
    i += 1
  }else{
    passthroughArgs.push(arg)
  }
}
const targetEnv = specifiedEnv ?? ''
const deployLabel = targetEnv === '' ? 'top-level (prod)' : targetEnv

try{
  console.log('Running lint...')
  run('lint', 'npm', ['run', 'lint'])

  console.log('Running typecheck...')
  run('typecheck', 'npm', ['run', 'typecheck'])

  console.log(`Deploying worker to Cloudflare (${deployLabel})...`)
  const deployArgs = ['--prefix', 'team-schedule-api', 'run', 'deploy']
  const forward = ['--env', targetEnv]
  if(passthroughArgs.length > 0) forward.push(...passthroughArgs)
  deployArgs.push('--', ...forward)
  run('deploy', 'npm', deployArgs)

  const healthTargets = new Map([
    ['', 'https://api.teamschedule.cc/api/_health'],
  ])
  const healthUrl = healthTargets.get(targetEnv)
  if(healthUrl){
    console.log(`Checking health at ${healthUrl}...`)
    const res = await fetch(healthUrl)
    if(!res.ok){
      throw new Error(`Health check failed with status ${res.status}`)
    }
    const body = await res.text()
    process.stdout.write(body)
    console.log('\nWorker deploy complete.')
  }else{
    console.log(`No health check configured for env '${targetEnv}'. Deploy complete.`)
  }
}catch(err){
  console.error(err.message)
  process.exit(1)
}
