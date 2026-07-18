import { compareWorlds, validateRegistry } from './validate-worlds.mjs';

const changedWorldCount = (before, after) => {
  const a = new Map(before.map(world => [world.id, world]));
  const b = new Map(after.map(world => [world.id, world]));
  return [...new Set([...a.keys(), ...b.keys()])].filter(id => JSON.stringify(a.get(id)) !== JSON.stringify(b.get(id))).length;
};

export function reconcileWorlds({ discoveredWorlds, currentRegistry, markets, policy, overrides, state, now = new Date() }) {
  if (discoveredWorlds.length < policy.minimumDiscoveredWorlds) throw new Error(`Discovered ${discoveredWorlds.length} worlds, below safety minimum ${policy.minimumDiscoveredWorlds}`);
  const excluded = new Set(overrides.exclude);
  const enabledMarkets = new Set(markets.filter(market => market.enabled !== false).map(market => market.id));
  const next = new Map(discoveredWorlds.filter(world => enabledMarkets.has(world.market) && !excluded.has(world.id)).map(world => [world.id, { ...world }]));
  for (const world of overrides.include) if (enabledMarkets.has(world.market)) next.set(world.id, { ...world });
  const missingWorlds = {};
  const graceMs = policy.removalGraceHours * 3600000;
  for (const current of currentRegistry.worlds) {
    if (!enabledMarkets.has(current.market) || excluded.has(current.id) || next.has(current.id)) continue;
    const observedAt = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const firstMissingAt = state.missingWorlds[current.id] ?? observedAt;
    if (now.getTime() - Date.parse(firstMissingAt) < graceMs) {
      next.set(current.id, { ...current });
      missingWorlds[current.id] = firstMissingAt;
    }
  }
  for (const [id, duration] of Object.entries(overrides.durationDays)) {
    if (!next.has(id)) throw new Error(`Duration override references unknown world ${id}`);
    if (duration !== policy.defaultDurationDays) next.get(id).durationDays = duration;
  }
  for (const world of next.values()) if (!(world.id in overrides.durationDays)) delete world.durationDays;
  const registry = { schemaVersion: 1, defaultDurationDays: policy.defaultDurationDays, worlds: [...next.values()].sort(compareWorlds) };
  validateRegistry(registry, markets);
  const worldChanges = changedWorldCount(currentRegistry.worlds, registry.worlds);
  if (worldChanges > policy.maximumWorldChangesPerRun) throw new Error(`Refusing to apply ${worldChanges} world changes; safety maximum is ${policy.maximumWorldChangesPerRun}`);
  return { registry, state: { missingWorlds }, worldChanges };
}
