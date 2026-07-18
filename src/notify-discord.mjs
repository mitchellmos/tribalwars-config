import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function diffRegistries(before, after) {
  const oldWorlds = new Map(before.worlds.map(world => [world.id, world]));
  const newWorlds = new Map(after.worlds.map(world => [world.id, world]));
  return {
    added: [...newWorlds.values()].filter(world => !oldWorlds.has(world.id)),
    removed: [...oldWorlds.values()].filter(world => !newWorlds.has(world.id)),
    changed: [...newWorlds.values()].filter(world => oldWorlds.has(world.id) && JSON.stringify(oldWorlds.get(world.id)) !== JSON.stringify(world)).map(world => ({ before: oldWorlds.get(world.id), after: world }))
  };
}

export function formatDiscordMessage(diff, commitUrl) {
  const lines = ['**Tribal Wars world config updated**'];
  for (const world of diff.added) lines.push(`➕ ${world.name} (${world.id}) — starts ${world.startsAt}`);
  for (const world of diff.removed) lines.push(`➖ ${world.name} (${world.id})`);
  for (const change of diff.changed) {
    const fields = ['name','url','market','category','startsAt','durationDays'].filter(field => change.before[field] !== change.after[field]);
    const details = fields.map(field => `${field}: ${change.before[field] ?? 'default'} → ${change.after[field] ?? 'default'}`).join('; ');
    lines.push(`✏️ ${change.after.name} (${change.after.id}) — ${details}`);
  }
  if (commitUrl) lines.push(`[View commit](${commitUrl})`);
  return lines.join('\n');
}

export async function sendDiscordMessage(webhook, content, fetchImpl = globalThis.fetch) {
  let response;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ content })
    });
    if (response.ok) return;
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }
  throw new Error(`Discord webhook failed with HTTP ${response?.status ?? 'unknown'}`);
}

async function main() {
  const [beforePath, afterPath] = process.argv.slice(2);
  const webhook = process.env.DISCORD_WEBHOOK_URL;

  if (beforePath === '--test') {
    if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is required');
    const repository = process.env.GITHUB_REPOSITORY ? ` for ${process.env.GITHUB_REPOSITORY}` : '';
    await sendDiscordMessage(webhook, `✅ **Tribal Wars config Discord test successful**${repository}`);
    return console.log('Discord test notification sent.');
  }

  if (!beforePath || !afterPath) throw new Error('Usage: notify-discord <before.json> <after.json>');
  const before = JSON.parse(await readFile(beforePath, 'utf8'));
  const after = JSON.parse(await readFile(afterPath, 'utf8'));
  const diff = diffRegistries(before, after);
  if (!diff.added.length && !diff.removed.length && !diff.changed.length) return console.log('No public config changes to notify.');
  if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is required when worlds.json changes');
  const commitSha = process.env.UPDATED_COMMIT || process.env.GITHUB_SHA;
  const commitUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && commitSha ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/commit/${commitSha}` : undefined;
  await sendDiscordMessage(webhook, formatDiscordMessage(diff, commitUrl));
  console.log('Discord notification sent.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
