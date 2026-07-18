import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMarkets, validateRegistry } from '../src/validate-worlds.mjs';

const markets = [{ id:'en', hostnameSuffix:'tribalwars.net', worldIdPattern:'^en(?:[0-9]+|c[0-9]+|p[0-9]+)$' }];
const world = number => ({ id:`en${number}`, name:`World ${number}`, url:`https://en${number}.tribalwars.net`, market:'en', category:'regular', startsAt:'2026-01-08T10:00:00Z' });
const registry = worlds => ({ schemaVersion:1, defaultDurationDays:1, worlds });
const marketDocument = enabled => ({ schemaVersion:1, markets:[{ id:'en', name:'International', hostnameSuffix:'tribalwars.net', worldIdPattern:'^en[0-9]+$', pageLocale:'en-dk', timeZone:'Europe/London', dateLocale:'en-GB', startDateLabel:'Start date', startDateFormat:'MMM dd,yyyy HH:mm', selectWorldLabel:'Select world', selectorUrl:'https://en156.tribalwars.net/en-dk/page/settings', ...(enabled === undefined ? {} : { enabled }) }] });

test('accepts a valid registry and keeps schema version 1', () => assert.equal(validateRegistry(registry([world(153)]), markets).schemaVersion, 1));
test('requires a supported category for every world', () => {
  assert.throws(() => validateRegistry(registry([{...world(153),category:'speed'}]), markets), /category/);
  const { category, ...uncategorized } = world(153);
  assert.throws(() => validateRegistry(registry([uncategorized]), markets), /missing category/);
});
test('requires markets schema version 1 and accepts an optional boolean enabled flag', () => {
  assert.equal(validateMarkets(marketDocument()).schemaVersion, 1);
  assert.equal(validateMarkets(marketDocument(false)).markets[0].enabled, false);
  assert.throws(() => validateMarkets({...marketDocument(),schemaVersion:2}), /schemaVersion must equal 1/);
  assert.throws(() => validateMarkets(marketDocument('no')), /enabled must be a boolean/);
});
test('rejects invalid timezone-less startsAt', () => assert.throws(() => validateRegistry(registry([{...world(153),startsAt:'2026-01-08 10:00'}]), markets), /UTC ISO/));
test('rejects mismatched market URLs and unsorted worlds', () => {
  assert.throws(() => validateRegistry(registry([{...world(153),url:'https://en153.example.com'}]), markets), /does not match/);
  assert.throws(() => validateRegistry(registry([world(154),world(153)]), markets), /sorted/);
});
