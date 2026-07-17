import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverWorlds } from './discover-worlds.mjs';
import { reconcileWorlds } from './normalize-worlds.mjs';
import { validateRepository, validateRegistry, validateState } from './validate-worlds.mjs';

const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
async function writeChanged(file, value) {
  const content = serialize(value);
  if (await readFile(file, 'utf8') === content) return false;
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content); await rename(temporary, file); return true;
}

export async function updateRegistry({ rootDirectory, fetchImpl, write = true, now = new Date() }) {
  const { registry: currentRegistry, markets, policy, overrides, state } = await validateRepository(rootDirectory);
  const discoveredWorlds = await discoverWorlds({ markets, policy, currentRegistry, fetchImpl });
  const result = reconcileWorlds({ discoveredWorlds, currentRegistry, markets, policy, overrides, state, now });
  validateRegistry(result.registry, markets); validateState(result.state);
  let registryChanged = serialize(currentRegistry) !== serialize(result.registry);
  let stateChanged = serialize(state) !== serialize(result.state);
  if (write) {
    registryChanged = await writeChanged(path.join(rootDirectory, 'worlds.json'), result.registry);
    stateChanged = await writeChanged(path.join(rootDirectory, '.state/missing-worlds.json'), result.state);
  }
  return { ...result, discoveredCount: discoveredWorlds.length, registryChanged, stateChanged };
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const dryRun = argumentsList.includes('--dry-run');
  const print = argumentsList.includes('--print');
  const unknown = argumentsList.filter(arg => arg !== '--dry-run' && arg !== '--print');
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await updateRegistry({ rootDirectory, write: !dryRun });
  console.log(`Discovered ${result.discoveredCount} supported worlds.`);
  console.log(`Detected ${result.worldChanges} world changes.`);
  console.log(dryRun ? 'Dry run complete; no files were written.' : result.registryChanged || result.stateChanged ? 'Updated registry files.' : 'Registry is already up to date.');
  if (print) console.log(JSON.stringify(result.registry, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); if (error.cause) console.error(`Cause: ${error.cause.message}`); process.exitCode = 1; });
