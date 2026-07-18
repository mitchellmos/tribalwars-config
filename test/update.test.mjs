import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileWorlds } from '../src/normalize-worlds.mjs';
import { diffRegistries, formatDiscordMessage, sendDiscordMessage } from '../src/notify-discord.mjs';

const markets = [{ id:'en', hostnameSuffix:'tribalwars.net', worldIdPattern:'^en(?:[0-9]+|c[0-9]+|p[0-9]+)$' }];
const world = (n,start='2026-01-01T10:00:00Z') => ({ id:`en${n}`,name:`World ${n}`,url:`https://en${n}.tribalwars.net`,market:'en',category:'regular',startsAt:start });
const registry = worlds => ({schemaVersion:1,defaultDurationDays:1,worlds});
const policy = {defaultDurationDays:1,removalGraceHours:72,minimumDiscoveredWorlds:1,maximumWorldChangesPerRun:3};
const overrides = {include:[],exclude:[],durationDays:{}};
const run = options => reconcileWorlds({ discoveredWorlds:[world(153),world(154)], currentRegistry:registry([world(153),world(154)]), markets, policy, overrides, state:{missingWorlds:{}}, now:new Date('2026-07-17T00:00:00Z'), ...options });

test('is idempotent and adds new selector worlds', () => {
  assert.equal(run({}).worldChanges,0);
  assert.equal(run({discoveredWorlds:[world(153),world(154),world(155)]}).worldChanges,1);
});
test('retains an absent world for 72 hours then removes it', () => {
  const first = run({discoveredWorlds:[world(154)]});
  assert.equal(first.registry.worlds.length,2); assert.equal(first.state.missingWorlds.en153,'2026-07-17T00:00:00Z');
  const removed = run({discoveredWorlds:[world(154)],state:first.state,now:new Date('2026-07-20T00:00:01Z')});
  assert.deepEqual(removed.registry.worlds,[world(154)]);
});
test('immediately omits worlds from a disabled market', () => {
  const disabledMarket = { id:'de', hostnameSuffix:'staemme.de', worldIdPattern:'^de[0-9]+$', enabled:false };
  const disabledWorld = { id:'de100',name:'Welt 100',url:'https://de100.staemme.de',market:'de',category:'regular',startsAt:'2026-01-01T10:00:00Z' };
  const result = run({
    discoveredWorlds:[world(153)],
    currentRegistry:registry([disabledWorld,world(153)]),
    markets:[...markets,disabledMarket]
  });
  assert.deepEqual(result.registry.worlds,[world(153)]);
  assert.deepEqual(result.state.missingWorlds,{});
});
test('updates a published start time and formats a Discord diff', () => {
  const after = registry([world(153,'2026-01-02T10:00:00Z'),world(154)]);
  const diff = diffRegistries(registry([world(153),world(154)]),after);
  assert.equal(diff.changed.length,1);
  assert.match(formatDiscordMessage(diff,'https://example.test/commit'), /2026-01-01T10:00:00Z → 2026-01-02T10:00:00Z/);
});
test('sends a Discord payload through the production notification path', async () => {
  let request;
  await sendDiscordMessage('https://discord.test/webhook', 'test message', async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  });
  assert.equal(request.url, 'https://discord.test/webhook');
  assert.deepEqual(JSON.parse(request.options.body), { content:'test message' });
});
test('rejects excessive changes', () => assert.throws(() => run({discoveredWorlds:[world(153),world(154),world(155)],policy:{...policy,maximumWorldChangesPerRun:0}}), /Refusing/));
