import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRegistry } from '../src/validate-worlds.mjs';

const markets = [{ id:'en', hostnameSuffix:'tribalwars.net', worldIdPattern:'^en(?:[0-9]+|c[0-9]+|p[0-9]+)$' }];
const world = number => ({ id:`en${number}`, name:`World ${number}`, url:`https://en${number}.tribalwars.net`, market:'en', startsAt:'2026-01-08T10:00:00Z' });
const registry = worlds => ({ schemaVersion:1, defaultDurationDays:1, worlds });

test('accepts a valid registry and keeps schema version 1', () => assert.equal(validateRegistry(registry([world(153)]), markets).schemaVersion, 1));
test('rejects invalid timezone-less startsAt', () => assert.throws(() => validateRegistry(registry([{...world(153),startsAt:'2026-01-08 10:00'}]), markets), /UTC ISO/));
test('rejects mismatched market URLs and unsorted worlds', () => {
  assert.throws(() => validateRegistry(registry([{...world(153),url:'https://en153.example.com'}]), markets), /does not match/);
  assert.throws(() => validateRegistry(registry([world(154),world(153)]), markets), /sorted/);
});
