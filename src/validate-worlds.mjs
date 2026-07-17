import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORLD_ID = /^[a-z][a-z0-9]*[0-9]+$/;
const MARKET_ID = /^[a-z][a-z0-9-]*$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function keys(value, allowed, label) {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw new Error(`${label} contains unexpected fields: ${extra.join(', ')}`);
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}`);
}
function isoInstant(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a UTC ISO 8601 instant without milliseconds`);
  }
}

export const worldNumber = id => Number.parseInt(id.match(/[0-9]+$/)?.[0] ?? '', 10);
const worldPrefix = id => id.replace(/[0-9]+$/, '');
export const compareWorlds = (a, b) => a.market.localeCompare(b.market) || worldPrefix(a.id).localeCompare(worldPrefix(b.id)) || worldNumber(a.id) - worldNumber(b.id) || a.id.localeCompare(b.id);

export function validateMarkets(document) {
  object(document, 'markets.json');
  keys(document, ['markets'], 'markets.json');
  if (!Array.isArray(document.markets) || !document.markets.length) throw new Error('markets.json.markets must be a non-empty array');
  const ids = new Set();
  for (const [index, market] of document.markets.entries()) {
    const label = `markets.json.markets[${index}]`;
    object(market, label);
    keys(market, ['id','name','hostnameSuffix','worldIdPattern','pageLocale','timeZone','dateLocale','startDateLabel','startDateFormat','selectWorldLabel','selectorUrl'], label);
    for (const field of ['id','name','hostnameSuffix','worldIdPattern','pageLocale','timeZone','dateLocale','startDateLabel','startDateFormat','selectWorldLabel','selectorUrl']) {
      if (typeof market[field] !== 'string' || !market[field]) throw new Error(`${label}.${field} must be a non-empty string`);
    }
    if (!MARKET_ID.test(market.id)) throw new Error(`${label}.id is invalid`);
    if (ids.has(market.id)) throw new Error(`Duplicate market ${market.id}`);
    ids.add(market.id);
    new RegExp(market.worldIdPattern);
    new Intl.DateTimeFormat(market.dateLocale, { timeZone: market.timeZone }).format(new Date());
    if (new URL(market.selectorUrl).protocol !== 'https:') throw new Error(`${label}.selectorUrl must use HTTPS`);
  }
  return document;
}

export function resolveMarket(hostname, markets) {
  return [...markets].sort((a,b) => b.hostnameSuffix.length - a.hostnameSuffix.length)
    .find(market => hostname === market.hostnameSuffix || hostname.endsWith(`.${market.hostnameSuffix}`));
}

export function validateWorld(world, markets, label = 'world') {
  object(world, label);
  keys(world, ['id','name','url','market','startsAt','durationDays'], label);
  for (const field of ['id','name','url','market','startsAt']) if (!(field in world)) throw new Error(`${label} is missing ${field}`);
  if (!WORLD_ID.test(world.id)) throw new Error(`${label}.id is invalid`);
  if (typeof world.name !== 'string' || !world.name.trim()) throw new Error(`${label}.name is invalid`);
  const market = markets.find(item => item.id === world.market);
  if (!market) throw new Error(`${label}.market is unknown`);
  if (!new RegExp(market.worldIdPattern).test(world.id)) throw new Error(`${label}.id does not match market ${market.id}`);
  const url = new URL(world.url);
  if (url.protocol !== 'https:' || url.hostname !== `${world.id}.${market.hostnameSuffix}` || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label}.url does not match its world and market`);
  }
  isoInstant(world.startsAt, `${label}.startsAt`);
  if ('durationDays' in world) integer(world.durationDays, 1, 365, `${label}.durationDays`);
}

export function validateRegistry(registry, markets) {
  object(registry, 'worlds.json');
  keys(registry, ['schemaVersion','defaultDurationDays','worlds'], 'worlds.json');
  if (registry.schemaVersion !== 1) throw new Error('worlds.json.schemaVersion must equal 1');
  integer(registry.defaultDurationDays, 1, 365, 'worlds.json.defaultDurationDays');
  if (!Array.isArray(registry.worlds) || !registry.worlds.length) throw new Error('worlds.json.worlds must be non-empty');
  const ids = new Set();
  registry.worlds.forEach((world, index) => {
    validateWorld(world, markets, `worlds.json.worlds[${index}]`);
    if (ids.has(world.id)) throw new Error(`Duplicate world ${world.id}`);
    ids.add(world.id);
  });
  if (JSON.stringify(registry.worlds.map(w => w.id)) !== JSON.stringify([...registry.worlds].sort(compareWorlds).map(w => w.id))) throw new Error('worlds.json.worlds must be sorted');
  return registry;
}

export function validatePolicy(policy) {
  object(policy, 'policy.json');
  keys(policy, ['defaultDurationDays','removalGraceHours','minimumDiscoveredWorlds','maximumWorldChangesPerRun','requestTimeoutMs','requestRetries'], 'policy.json');
  integer(policy.defaultDurationDays, 1, 365, 'policy.defaultDurationDays');
  integer(policy.removalGraceHours, 1, 8760, 'policy.removalGraceHours');
  integer(policy.minimumDiscoveredWorlds, 1, 1000, 'policy.minimumDiscoveredWorlds');
  integer(policy.maximumWorldChangesPerRun, 1, 1000, 'policy.maximumWorldChangesPerRun');
  integer(policy.requestTimeoutMs, 1000, 120000, 'policy.requestTimeoutMs');
  integer(policy.requestRetries, 0, 10, 'policy.requestRetries');
  return policy;
}

export function validateOverrides(overrides, markets) {
  object(overrides, 'overrides.json');
  keys(overrides, ['include','exclude','durationDays'], 'overrides.json');
  if (!Array.isArray(overrides.include) || !Array.isArray(overrides.exclude)) throw new Error('Override include/exclude must be arrays');
  overrides.include.forEach((world,index) => validateWorld(world, markets, `overrides.include[${index}]`));
  const included = new Set(overrides.include.map(world => world.id));
  const excluded = new Set();
  for (const id of overrides.exclude) {
    if (typeof id !== 'string' || !WORLD_ID.test(id)) throw new Error(`Invalid excluded world ${id}`);
    if (excluded.has(id)) throw new Error(`Duplicate excluded world ${id}`);
    if (included.has(id)) throw new Error(`World ${id} cannot be included and excluded`);
    excluded.add(id);
  }
  object(overrides.durationDays, 'overrides.durationDays');
  for (const [id, value] of Object.entries(overrides.durationDays)) { if (!WORLD_ID.test(id)) throw new Error(`Invalid duration world ${id}`); integer(value, 1, 365, 'Duration override'); }
  return overrides;
}

export function validateState(state) {
  object(state, 'state'); object(state.missingWorlds, 'state.missingWorlds');
  for (const [id, since] of Object.entries(state.missingWorlds)) { if (!WORLD_ID.test(id)) throw new Error(`Invalid state world ${id}`); isoInstant(since, `state.${id}`); }
  return state;
}

export async function validateRepository(root) {
  const read = async file => JSON.parse(await readFile(path.join(root,file), 'utf8'));
  const marketsDocument = validateMarkets(await read('markets.json'));
  const markets = marketsDocument.markets;
  return {
    markets,
    registry: validateRegistry(await read('worlds.json'), markets),
    policy: validatePolicy(await read('policy.json')),
    overrides: validateOverrides(await read('overrides.json'), markets),
    state: validateState(await read('.state/missing-worlds.json'))
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { registry, markets } = await validateRepository(root);
  console.log(`Validated ${registry.worlds.length} worlds across ${markets.length} markets.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
