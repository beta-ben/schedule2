#!/usr/bin/env node
import { execSync } from 'node:child_process'

const port = process.argv[2] || process.env.PORT || '8787'
try {
  execSync(`bash -lc 'lsof -ti:${port} | xargs -r kill -9'`, { stdio: 'ignore' })
} catch {}
