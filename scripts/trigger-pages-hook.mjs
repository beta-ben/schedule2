#!/usr/bin/env node
/**
 * trigger-pages-hook.mjs
 * Posts to a Cloudflare Pages deploy hook URL.
 */
import process from 'node:process';

const envMap = {
  prod: 'CF_PAGES_DEPLOY_HOOK_PROD',
  production: 'CF_PAGES_DEPLOY_HOOK_PROD',
  staging: 'CF_PAGES_DEPLOY_HOOK_STAGING',
  stage: 'CF_PAGES_DEPLOY_HOOK_STAGING',
};

function parseArgs(argv) {
  const args = {
    hook: process.env.CF_PAGES_DEPLOY_HOOK,
    envVar: null,
    payload: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--hook':
        args.hook = argv[++i];
        break;
      case '--env': {
        const key = argv[++i];
        const resolved = envMap[key?.toLowerCase?.()] || null;
        if (resolved) {
          args.envVar = resolved;
          args.hook = process.env[resolved] ?? args.hook;
        } else {
          console.error(`Unknown environment: ${key}`);
          process.exit(1);
        }
        break;
      }
      case '--env-var':
        args.envVar = argv[++i];
        args.hook = process.env[args.envVar] ?? args.hook;
        break;
      case '--payload':
        args.payload = argv[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        console.error(`Unknown option: ${token}`);
        args.help = true;
        return args;
    }
  }

  if (!args.envVar && args.hook && !args.hook.startsWith('https://')) {
    // Treat provided string as env var name
    args.envVar = args.hook;
    args.hook = process.env[args.envVar];
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/trigger-pages-hook.mjs [--env prod|staging] [--hook <url>] [--env-var NAME] [--payload '{"branch":"main"}']`);
  console.log('\nEnvironment variables:');
  console.log('  CF_PAGES_DEPLOY_HOOK_PROD     Deploy hook URL for teamschedulecc');
  console.log('  CF_PAGES_DEPLOY_HOOK_STAGING  Deploy hook URL for schedule2-staging');
  console.log('  CF_PAGES_DEPLOY_HOOK          Fallback hook URL when no env flag given');
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const hookUrl = options.hook || (options.envVar ? process.env[options.envVar] : null);

  if (!hookUrl) {
    console.error('Missing deploy hook URL. Pass --hook <url>, --env <prod|staging>, or set CF_PAGES_DEPLOY_HOOK.');
    process.exit(1);
  }

  if (!hookUrl.startsWith('https://')) {
    console.error('Deploy hook must be an https:// URL.');
    process.exit(1);
  }

  let body;
  let headers;
  if (options.payload) {
    try {
      body = options.payload;
      JSON.parse(options.payload);
      headers = { 'content-type': 'application/json' };
    } catch (err) {
      console.error('Payload must be valid JSON:', err.message);
      process.exit(1);
    }
  }

  process.stdout.write(`Triggering Cloudflare Pages deploy hook${options.envVar ? ` (${options.envVar})` : ''}... `);

  try {
    const response = await fetch(hookUrl, {
      method: 'POST',
      body,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('failed');
      console.error(`HTTP ${response.status}: ${text}`);
      process.exit(1);
    }

    let info = '';
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        const json = await response.json();
        const result = json.result || json;
        const id = result.id || result.deployment_id;
        if (id) info += ` deployment=${id}`;
        if (result.environment) info += ` environment=${result.environment}`;
      } catch (err) {
        // ignore JSON parse errors
      }
    }

    console.log(`done${info}`);
  } catch (err) {
    console.error('failed');
    console.error(err.message);
    process.exit(1);
  }
}

main();
