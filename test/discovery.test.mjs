import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverWorlds, fetchPage, parseSettingsPage, parseWorldSelector } from '../src/discover-worlds.mjs';

const market = { id:'en', hostnameSuffix:'tribalwars.net', worldIdPattern:'^en(?:[0-9]+|c[0-9]+|p[0-9]+)$', pageLocale:'en-dk', timeZone:'Europe/London', dateLocale:'en-GB', startDateLabel:'Start date', startDateFormat:'MMM dd,yyyy HH:mm', selectWorldLabel:'Select world', selectorUrl:'https://en156.tribalwars.net/en-dk/page/settings' };
const selector = `<div class="content-selector"><h3>Select world</h3><a href="https://ens1.tribalwars.net/en-dk/page/stats">Speed</a><a href="https://en155.tribalwars.net/en-dk/page/stats">World 155</a><a href="https://en156.tribalwars.net/en-dk/page/stats">World 156</a><a href="https://enc1.tribalwars.net/en-dk/page/stats">Classic</a><a href="https://enp19.tribalwars.net/en-dk/page/stats">Casual 19</a></div>`;
const settings = (id, date, extra = '') => `<html><head><link rel="canonical" href="https://${id}.tribalwars.net/en-dk/page/settings"></head><body>${selector}${extra}<table class="data-table"><tr><td>Start date</td><td>${date}</td></tr></table></body></html>`;

test('extracts supported worlds from the public selector', () => {
  assert.deepEqual(parseWorldSelector(selector, [market]), [
    { id:'en155', name:'World 155', url:'https://en155.tribalwars.net', market:'en' },
    { id:'en156', name:'World 156', url:'https://en156.tribalwars.net', market:'en' },
    { id:'enc1', name:'Classic', url:'https://enc1.tribalwars.net', market:'en' },
    { id:'enp19', name:'Casual 19', url:'https://enp19.tribalwars.net', market:'en' }
  ]);
});

test('normalizes winter and summer UK dates to UTC', () => {
  const base = id => ({ id, name:`World ${id.slice(2)}`, url:`https://${id}.tribalwars.net`, market:'en' });
  assert.equal(parseSettingsPage(settings('en153','Jan 08,2026 10:00'), base('en153'), market).startsAt, '2026-01-08T10:00:00Z');
  assert.equal(parseSettingsPage(settings('en156','Jun 17,2026 10:00'), base('en156'), market).startsAt, '2026-06-17T09:00:00Z');
});

test('rejects wrong canonical and missing start dates', () => {
  const world = { id:'en156', name:'World 156', url:'https://en156.tribalwars.net', market:'en' };
  assert.throws(() => parseSettingsPage(settings('en155','Jun 17,2026 10:00'), world, market), /canonical/);
  assert.throws(() => parseSettingsPage(`<link rel="canonical" href="${world.url}/en-dk/page/settings">`, world, market), /Start date/);
});

test('discovers and enriches every selector world', async () => {
  const pages = new Map([
    [market.selectorUrl, settings('en156','Jun 17,2026 10:00')],
    ['https://en155.tribalwars.net/en-dk/page/settings', settings('en155','Apr 23,2026 10:00')],
    ['https://enc1.tribalwars.net/en-dk/page/settings', settings('enc1','Jan 01,2020 10:00')],
    ['https://enp19.tribalwars.net/en-dk/page/settings', settings('enp19','Jul 01,2026 10:00')]
  ]);
  const fetchImpl = async url => new Response(pages.get(url), { status: pages.has(url) ? 200 : 404 });
  const worlds = await discoverWorlds({ markets:[market], policy:{requestTimeoutMs:1000,requestRetries:0}, fetchImpl });
  assert.deepEqual(worlds.map(world => [world.id,world.startsAt]), [['en155','2026-04-23T09:00:00Z'],['en156','2026-06-17T09:00:00Z'],['enc1','2020-01-01T10:00:00Z'],['enp19','2026-07-01T09:00:00Z']]);
});

test('retries outages and never converts them into empty discovery', async () => {
  let calls = 0;
  const html = await fetchPage('https://example.test', { retries:1, retryDelayMs:0, fetchImpl:async () => { calls++; if (calls === 1) throw new Error('offline'); return new Response('ok'); } });
  assert.equal(html,'ok'); assert.equal(calls,2);
  await assert.rejects(fetchPage('https://example.test', { retries:0, fetchImpl:async () => { throw new Error('offline'); } }), /Unable to fetch/);
});
