#!/usr/bin/env node
/**
 * release-status.mjs
 * Quick snapshot of git + deployment branches before promoting changes.
 */
import { spawnSync } from 'node:child_process';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
  if (res.status !== 0) {
    const err = res.stderr?.trim() || res.error?.message || 'Unknown error';
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${err}`);
  }
  return res.stdout.trim();
}

function tryRun(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
  if (res.status !== 0) return null;
  return res.stdout.trim();
}

function parseArgs(argv) {
  const args = { remote: process.env.RELEASE_REMOTE || 'origin', fetch: true };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--remote' && argv[i + 1]) {
      args.remote = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--no-fetch') {
      args.fetch = false;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHeader(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

function summarizeBranch(branch) {
  try {
    const sha = run('git', ['rev-parse', branch]);
    const subject = tryRun('git', ['log', '-1', '--pretty=%s', branch]) || '';
    return { branch, sha, subject };
  } catch (err) {
    return null;
  }
}

function listCommits(range) {
  const out = tryRun('git', ['log', '--oneline', range]);
  if (!out) return [];
  return out.split('\n').filter(Boolean).slice(0, 5);
}

function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: npm run release:status [-- --remote origin] [--no-fetch]');
    return;
  }

  try {
    if (options.fetch) {
      console.log(`Fetching ${options.remote}/main and ${options.remote}/staging...`);
      run('git', ['fetch', '--prune', options.remote, 'main', 'staging']);
    }
  } catch (err) {
    console.error('Unable to fetch branches:', err.message);
  }

  const clean = (tryRun('git', ['status', '--short']) || '').length === 0;
  printHeader('Working tree');
  console.log(clean ? '✓ Clean' : '⚠️  Uncommitted changes present');

  const mainSummary = summarizeBranch('main');
  const stagingSummary = summarizeBranch('staging');
  const remoteMain = summarizeBranch(`${options.remote}/main`);
  const remoteStaging = summarizeBranch(`${options.remote}/staging`);

  printHeader('Local branches');
  if (mainSummary) {
    console.log(`main    ${mainSummary.sha.slice(0, 12)}  ${mainSummary.subject}`);
  } else {
    console.log('main    (missing locally)');
  }
  if (stagingSummary) {
    console.log(`staging ${stagingSummary.sha.slice(0, 12)}  ${stagingSummary.subject}`);
  } else {
    console.log('staging (missing locally)');
  }

  if (remoteMain || remoteStaging) {
    printHeader(`Remote tracking (${options.remote})`);
    if (remoteMain) {
      console.log(`${options.remote}/main    ${remoteMain.sha.slice(0, 12)}  ${remoteMain.subject}`);
    } else {
      console.log(`${options.remote}/main    (missing)`);
    }
    if (remoteStaging) {
      console.log(`${options.remote}/staging ${remoteStaging.sha.slice(0, 12)}  ${remoteStaging.subject}`);
    } else {
      console.log(`${options.remote}/staging (missing)`);
    }
  }

  const diffPairs = [
    { label: 'Local', left: 'staging', right: 'main' },
    { label: `Remote (${options.remote})`, left: `${options.remote}/staging`, right: `${options.remote}/main` },
  ];

  diffPairs.forEach(({ label, left, right }) => {
    if (!tryRun('git', ['rev-parse', '--verify', left]) || !tryRun('git', ['rev-parse', '--verify', right])) {
      return;
    }
    const aheadRight = tryRun('git', ['rev-list', '--count', `${left}..${right}`]) || '0';
    const aheadLeft = tryRun('git', ['rev-list', '--count', `${right}..${left}`]) || '0';
    printHeader(`Diff summary (${label})`);
    console.log(`${right} ahead of ${left}: ${aheadRight}`);
    console.log(`${left} ahead of ${right}: ${aheadLeft}`);
    if (aheadRight !== '0') {
      const commits = listCommits(`${left}..${right}`);
      if (commits.length) {
        console.log(`\nCommits moving forward (${right}):`);
        commits.forEach((line) => console.log(`  ${line}`));
      }
    }
    if (aheadLeft !== '0') {
      const commits = listCommits(`${right}..${left}`);
      if (commits.length) {
        console.log(`\nCommits only on ${left}:`);
        commits.forEach((line) => console.log(`  ${line}`));
      }
    }
  });

  console.log('\nTips');
  console.log('- Run `npm run release:preflight` before pushing to staging.');
  console.log('- Fast-forward merges keep staging and main identical when promoting.');
}

main();
