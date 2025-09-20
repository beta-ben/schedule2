#!/usr/bin/env node
/**
 * deploy-pages.mjs
 * Wraps wrangler pages deploy for direct-upload projects.
 */
import process from 'node:process';
import { spawn } from 'node:child_process';

const projects = {
  staging: {
    name: 'schedule2-staging',
    branch: 'staging',
    envVar: 'CLOUDFLARE_PAGES_STAGING',
  },
  prod: {
    name: 'teamschedulecc',
    branch: 'main',
    envVar: 'CLOUDFLARE_PAGES_PROD',
  },
};

function usage() {
  const keys = Object.keys(projects).join('|');
  console.log(`Usage: node scripts/deploy-pages.mjs <${keys}> [--dir dist] [--branch <name>] [--project <name>]`);
  console.log('\nEnvironment requirements:');
  console.log('  CLOUDFLARE_ACCOUNT_ID  Cloudflare account id');
  console.log('  CLOUDFLARE_API_TOKEN   Token with Pages writes');
}

function parseArgs(argv) {
  const res = {
    target: null,
    dir: 'dist',
    branch: null,
    project: null,
  };
  if (!argv.length) return res;
  res.target = argv[0];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--dir':
        res.dir = argv[++i] ?? res.dir;
        break;
      case '--branch':
        res.branch = argv[++i] ?? null;
        break;
      case '--project':
        res.project = argv[++i] ?? null;
        break;
      case '--help':
      case '-h':
        res.help = true;
        break;
      default:
        console.error(`Unknown option: ${token}`);
        res.help = true;
        return res;
    }
  }
  return res;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const preset = projects[args.target];
  if (!preset) {
    console.error(`Unknown target ${args.target}`);
    usage();
    process.exit(1);
  }

  const projectName = args.project || preset.name;
  const branch = args.branch || preset.branch;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.');
    process.exit(1);
  }

  const wranglerArgs = ['pages', 'deploy', args.dir, '--project-name', projectName, '--branch', branch];

  console.log(`Deploying ${projectName} (${args.target}) from ${args.dir} on branch ${branch}...`);

  const child = spawn('wrangler', wranglerArgs, { stdio: 'inherit' });
  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`wrangler exited with code ${code}`);
      process.exit(code ?? 1);
    }
  });
}

main();
