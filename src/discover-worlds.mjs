import * as cheerio from 'cheerio';
import { DateTime } from 'luxon';
import { resolveMarket } from './validate-worlds.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchPage(url, { timeoutMs = 15000, retries = 2, fetchImpl = globalThis.fetch, retryDelayMs = 250 } = {}) {
  let cause;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers: { accept: 'text/html', 'user-agent': 'tribalwars-config-updater/1.0' }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (!html.trim()) throw new Error('Empty HTML response');
      return html;
    } catch (error) {
      cause = error;
      if (attempt < retries) await wait(retryDelayMs * (attempt + 1));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Unable to fetch ${url} after ${retries + 1} attempts`, { cause });
}

export function parseWorldSelector(html, markets) {
  const $ = cheerio.load(html);
  const worlds = new Map();
  $('.content-selector').each((_, element) => {
    const heading = $(element).find('h3').first().text().trim();
    const possibleMarkets = markets.filter(market => heading === market.selectWorldLabel);
    if (!possibleMarkets.length) return;
    $(element).find('a[href]').each((__, anchor) => {
      let url;
      try { url = new URL($(anchor).attr('href')); } catch { return; }
      const market = resolveMarket(url.hostname, possibleMarkets);
      if (!market) return;
      const id = url.hostname.slice(0, -(market.hostnameSuffix.length + 1));
      if (!new RegExp(market.worldIdPattern).test(id)) return;
      worlds.set(id, { id, name: $(anchor).text().trim(), url: `https://${url.hostname}`, market: market.id });
    });
  });
  if (!worlds.size) throw new Error('No supported worlds found in the public world selector');
  return [...worlds.values()];
}

export function parseSettingsPage(html, world, market) {
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').attr('href');
  const expected = `${world.url}/${market.pageLocale}/page/settings`;
  if (canonical !== expected) throw new Error(`Settings page canonical URL did not match ${world.id}`);
  let rawStart;
  $('table.data-table tr').each((_, row) => {
    const cells = $(row).find('td');
    if ($(cells[0]).text().trim() === market.startDateLabel) rawStart = $(cells[1]).text().trim();
  });
  if (!rawStart) throw new Error(`Settings page for ${world.id} did not contain ${market.startDateLabel}`);
  const parsed = DateTime.fromFormat(rawStart, market.startDateFormat, { locale: market.dateLocale, zone: market.timeZone, setZone: true });
  if (!parsed.isValid) throw new Error(`Invalid start date for ${world.id}: ${rawStart}`);
  return { ...world, startsAt: parsed.toUTC().toISO({ suppressMilliseconds: true }) };
}

export async function discoverWorlds({ markets, policy, currentRegistry = { worlds: [] }, fetchImpl }) {
  const discovered = [];
  for (const market of markets) {
    const fallbackUrls = currentRegistry.worlds.filter(world => world.market === market.id).map(world => `${world.url}/${market.pageLocale}/page/settings`);
    const selectorUrls = [...new Set([market.selectorUrl, ...fallbackUrls])];
    let selectorHtml;
    let selectorSourceUrl;
    let lastError;
    for (const url of selectorUrls) {
      try {
        const html = await fetchPage(url, { timeoutMs: policy.requestTimeoutMs, retries: policy.requestRetries, fetchImpl });
        parseWorldSelector(html, [market]);
        selectorHtml = html; selectorSourceUrl = url; break;
      } catch (error) { lastError = error; }
    }
    if (!selectorHtml) throw new Error(`Unable to read a valid world selector for market ${market.id}`, { cause: lastError });
    const candidates = parseWorldSelector(selectorHtml, [market]);
    for (const candidate of candidates) {
      const settingsUrl = `${candidate.url}/${market.pageLocale}/page/settings`;
      const settingsHtml = settingsUrl === selectorSourceUrl ? selectorHtml : await fetchPage(settingsUrl, { timeoutMs: policy.requestTimeoutMs, retries: policy.requestRetries, fetchImpl });
      discovered.push(parseSettingsPage(settingsHtml, candidate, market));
    }
  }
  return discovered;
}
