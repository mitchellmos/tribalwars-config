# Tribal Wars Config

Automatically maintained source of truth for the Tribal Wars worlds used by the map generator and website.

## What it does

The updater reads each configured market's public world selector and settings pages. It:

- Includes standard, classic/special, and casual worlds.
- Excludes speed servers.
- Reads each world's localized start date and converts it to UTC.
- Publishes deterministic, validated JSON in `worlds.json`.
- Adds newly published worlds automatically.
- Removes a missing world only after a 72-hour grace period.
- Commits only when the public config or removal state changes.
- Sends a Discord notification when `worlds.json` changes.

The workflow runs daily at 22:00 Dutch time (`Europe/Amsterdam`, including CET/CEST daylight-saving changes) and can also be started manually.

## Published config

Consumers should fetch:

```text
https://raw.githubusercontent.com/mitchellmos/tribalwars-config/main/worlds.json
```

Example:

```json
{
  "schemaVersion": 1,
  "defaultDurationDays": 1,
  "worlds": [
    {
      "id": "en156",
      "name": "World 156",
      "url": "https://en156.tribalwars.net",
      "market": "en",
      "category": "regular",
      "startsAt": "2026-06-17T09:00:00Z"
    }
  ]
}
```

`category` is always `regular`, `casual`, or `special`. `startsAt` is always an absolute UTC ISO 8601 timestamp. A world may optionally provide `durationDays`; otherwise consumers use `defaultDurationDays`.

## Required setup

After pushing the repository:

1. Open **Settings → Actions → General → Workflow permissions** and enable **Read and write permissions**.
2. Create a Discord webhook for the desired channel.
3. Add it under **Settings → Secrets and variables → Actions** as `DISCORD_WEBHOOK_URL`.
4. Open **Actions → Test Discord notification → Run workflow** to verify the webhook.
5. Open **Actions → Update world registry → Run workflow** to verify live discovery and repository writes.

The repository must remain publicly readable if consumers use the raw GitHub URL without authentication.

## Local verification

Node.js 24 LTS is required.

```bash
npm ci
npm test
npm run validate
npm run preview
```

`npm run preview` fetches the live pages and prints the complete prospective `worlds.json` without writing files.

To apply a live update locally:

```bash
npm run update
```

## Configuration

| File | Purpose |
|---|---|
| `worlds.json` | Published source of truth consumed by other repositories |
| `markets.json` | Versioned market hostname, locale, date format, timezone, and inclusion rules |
| `policy.json` | Update thresholds, retries, default duration, and removal grace period |
| `overrides.json` | Manual include, exclude, and per-world duration exceptions |
| `.state/missing-worlds.json` | Internal first-observed-absence timestamps |
| `schema/worlds.schema.json` | Public config schema |

International `.tribalwars.net` worlds use `Europe/London`, which handles GMT and BST automatically. Additional markets can be added to `markets.json` with their own hostname suffix, optional page-locale path segment, localized labels, date format, and IANA timezone.

`markets.json` has its own `schemaVersion`, which must be `1`. A market can set `enabled` to `false` to skip automatic discovery and omit its worlds from publication while it is not ready to appear on the website; omitted `enabled` values default to enabled.

## Consumer requirements

Consumers should:

1. Fetch and validate the config during build or deployment.
2. Reject unsupported `schemaVersion` values.
3. Use the explicit per-world `category` rather than inferring it from IDs or localized names.
4. Skip map generation while `startsAt` is later than the current UTC time.
5. Use `durationDays` or fall back to `defaultDurationDays`.
6. Keep the previously deployed output if the config cannot be downloaded or validated.

Integration changes for `tribalwars-map` and `maps-website` are handled in those repositories.

See [the implementation plan](docs/implementation-plan.md) for the detailed design and verification criteria.
