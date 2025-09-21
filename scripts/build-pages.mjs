#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const cwd = process.cwd();
const ENV_PATH = path.join(cwd, '.env.production');
const TARGETS = {
  staging: path.join(cwd, '.env.production.staging'),
};

function usage() {
  console.log('Usage: node scripts/build-pages.mjs <staging>');
  console.log('Temporarily swaps .env.production before running "npm run build".');
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  const target = process.argv[2];
  if (!target || !(target in TARGETS)) {
    usage();
    process.exit(1);
  }

  const overridePath = TARGETS[target];
  let originalContents = null;

  try {
    originalContents = await fs.readFile(ENV_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const override = await fs.readFile(overridePath, 'utf8').catch((err) => {
    if (err.code === 'ENOENT') {
      throw new Error(`Missing ${path.relative(cwd, overridePath)}. Copy the example or create it before building.`);
    }
    throw err;
  });

  await fs.writeFile(ENV_PATH, override, 'utf8');
  try {
    await run('npm', ['run', 'build']);
  } finally {
    if (originalContents !== null) {
      await fs.writeFile(ENV_PATH, originalContents, 'utf8');
    } else {
      await fs.unlink(ENV_PATH).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
