# Tribal Wars Config Implementation Plan

## Objective

Build `tribalwars-config` as the neutral, automatically maintained source of truth for the Tribal Wars worlds used by `tribalwars-map` and `maps-website`.

The public consumer contract is:

```text
https://raw.githubusercontent.com/mitchellmos/tribalwars-config/main/worlds.json
```

Only `worlds.json` is consumed by other repositories. Policy, overrides, and missing-world state are internal implementation details of this repository.

## Repository deliverables

- A versioned `worlds.json` consumer contract.
- A JSON Schema describing the contract.
- A configurable discovery policy.
- Explicit include, exclude, and duration overrides.
- A deterministic Node.js updater.
- Conservative removal tracking across successful runs.
- Unit and integration tests for discovery, validation, and reconciliation.
- A scheduled and manually dispatchable GitHub Actions workflow.
- Consumer and operator documentation.

## Implementation phases

### 1. Contract and policy

- Define schema version 1.
- Store world ID, display name, HTTPS URL, market, UTC start time, and optional duration override.
- Keep the default map duration at registry level.
- Sort worlds numerically and reject duplicate IDs.
- Separate discovery policy from published configuration.

### 2. Discovery and normalization

- Read each market's public world selector and settings pages.
- Include standard, classic/special, and casual worlds while excluding speed servers.
- Match hostnames to data-driven market definitions using the longest hostname suffix.
- Parse localized start dates with each market's locale, format, and IANA timezone, then publish UTC.
- Apply manual include, exclude, and duration overrides.
- Produce stable JSON with no timestamp-only changes.

### 3. Safety controls

- Retry temporary upstream failures.
- Reject empty, malformed, or unexpectedly small results.
- Refuse more than the configured number of world changes in one run.
- Add valid new worlds immediately.
- Remove a missing world only after a 72-hour grace period based on valid selector responses.
- Reset missing-world state when the world reappears.
- Never modify the registry after a failed discovery request.

### 4. Automation

- Run daily at 22:00 Dutch time (`Europe/Amsterdam`), including CET/CEST daylight-saving changes.
- Support manual `workflow_dispatch` runs.
- Test and validate before updating.
- Commit only changed registry or state files.
- Use the repository `GITHUB_TOKEN` with only `contents: write`.
- Prevent overlapping updater runs with workflow concurrency.
- Notify Discord after a successful push only when `worlds.json` changed.

### 5. Consumer handoff

- Document the raw GitHub URL and schema-version behavior.
- Make consumers fetch during their build workflows rather than in browsers.
- Require consumers to retain their last deployed output if fetching fails.
- Update `tribalwars-map` and `maps-website` in a separate integration phase.

## Verification matrix

- Normal discovery produces the expected registry.
- Repeated identical discovery produces no diff.
- A source outage fails without changing files.
- Empty and malformed responses fail safely.
- Duplicate IDs and mismatched URLs are rejected.
- A valid new world is added.
- A missing world is retained during the time-based grace period.
- A missing world is removed after the grace period.
- Reappearance resets its missing counter.
- Manual overrides behave deterministically.
- Excessive changes are rejected.

## Definition of done

- The public raw URL returns valid schema version 1 JSON.
- Tests and validation pass locally and in GitHub Actions.
- The updater is idempotent.
- Invalid upstream data cannot replace the registry.
- Addition and delayed-removal behavior is covered by tests.
- Operator recovery and consumer integration are documented.
