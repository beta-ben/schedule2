#!/usr/bin/env node
/**
 * promote-parent.mjs
 * Run this FROM INSIDE an inner duplicated project directory (e.g. ./schedule2/schedule2)
 * when the parent does NOT have a package.json and you want to move this project up one level.
 *
 * Behavior:
 *  - Copies files/dirs (excluding: node_modules, dist, coverage, .git) to parent if missing.
 *  - Does NOT overwrite differing existing parent files unless --force supplied.
 *  - Records conflicts in promote-conflicts.txt in parent.
 *  - With --force, overwrites differing files (backup written alongside with .bak timestamp).
 *  - With --delete (after successful copy), removes the inner directory (except node_modules if --keep-node-modules).
 *
 * Flags:
 *   --force            Overwrite conflicting files (writes .bak copies first)
 *   --delete           Delete inner directory after promotion (only if no conflicts or --force)
 *   --keep-node-modules  When deleting, retain inner/node_modules (moved to parent/node_modules if absent)
 *   --verbose          Log each copied file
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INNER = process.cwd();
const PARENT = path.dirname(INNER);

async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }
async function isDir(p){ try { return (await fs.stat(p)).isDirectory(); } catch { return false; } }

async function main(){
  const innerPkg = path.join(INNER,'package.json');
  if(!await exists(innerPkg)){
    console.error('Not inside a project directory (missing package.json). Abort.');
    process.exit(1);
  }
  const parentPkg = path.join(PARENT,'package.json');
  if(await exists(parentPkg)){
    console.log('Parent already has package.json. Use flatten-nested instead. Abort.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const FORCE = args.includes('--force');
  const DELETE = args.includes('--delete');
  const VERBOSE = args.includes('--verbose');
  const KEEP_NODE_MODULES = args.includes('--keep-node-modules');

  console.log(`[promote] inner=${INNER}`);
  console.log(`[promote] parent=${PARENT}`);
  console.log(`[promote] force=${FORCE} delete=${DELETE} keep-node_modules=${KEEP_NODE_MODULES}`);

  const SKIP = new Set(['node_modules','dist','coverage','.git']);
  const conflicts = [];
  const copied = [];
  const overwritten = [];

  async function* walk(dir){
    for(const entry of await fs.readdir(dir, { withFileTypes:true })){
      if(SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if(entry.isDirectory()){
        yield* walk(full);
      } else {
        yield full;
      }
    }
  }

  for await (const file of walk(INNER)){
    const rel = path.relative(INNER, file);
    const dest = path.join(PARENT, rel);
    const destDir = path.dirname(dest);
    if(!await exists(dest)){
      await fs.mkdir(destDir, { recursive:true });
      await fs.copyFile(file, dest);
      copied.push(rel);
      if(VERBOSE) console.log('[copy]', rel);
    } else {
      // Compare
      const [a,b] = await Promise.all([fs.readFile(file), fs.readFile(dest)]);
      if(a.equals(b)) continue; // identical
      if(FORCE){
        const backup = dest + '.bak-' + Date.now();
        await fs.copyFile(dest, backup);
        await fs.copyFile(file, dest);
        overwritten.push(rel);
        if(VERBOSE) console.log('[overwrite]', rel, '(backup '+path.basename(backup)+')');
      } else {
        conflicts.push(rel);
      }
    }
  }

  if(conflicts.length){
    const conflictPath = path.join(PARENT,'promote-conflicts.txt');
    await fs.writeFile(conflictPath, conflicts.map(c=>'CONFLICT '+c).join('\n')+'\n');
    console.log(`[promote] Conflicts (${conflicts.length}) written to ${path.basename(conflictPath)}.`);
  }
  console.log(`[promote] Copied ${copied.length} new files. Overwritten ${overwritten.length}. Conflicts ${conflicts.length}.`);

  if(DELETE){
    if(conflicts.length && !FORCE){
      console.log('[promote] Refusing to delete inner directory while conflicts remain (re-run with --force or resolve).');
    } else {
      if(KEEP_NODE_MODULES && await isDir(path.join(INNER,'node_modules')) && !(await exists(path.join(PARENT,'node_modules')))){
        console.log('[promote] Moving node_modules to parent...');
        await fs.rename(path.join(INNER,'node_modules'), path.join(PARENT,'node_modules'));
      }
      // Remove inner (best-effort)
      await removeDir(INNER);
      console.log('[promote] Removed inner project directory.');
    }
  } else {
    console.log('[promote] Inner directory retained. Run again with --delete after verifying.');
  }
}

async function removeDir(dir){
  // recursive delete
  for(const entry of await fs.readdir(dir, { withFileTypes:true })){
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) await removeDir(full); else await fs.unlink(full);
  }
  await fs.rmdir(dir);
}

main().catch(e=>{ console.error('[promote] Error', e); process.exit(1); });
