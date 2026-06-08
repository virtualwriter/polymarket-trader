# Cleanup Dry-Run Harness

Use this before and after any codebase cleanup slice that could affect production behavior.

```bash
npm run prod:verify
npm run cleanup:harness -- --out .runtime/cleanup-harness/local-before.json
npm run cleanup:harness -- --out .runtime/cleanup-harness/local-after.json
npm run cleanup:harness -- --compare .runtime/cleanup-harness/local-before.json --out .runtime/cleanup-harness/local-compare.json
```

On the USA VPS, run the same commands from `/opt/polymarket-trader`.

The harness runs:

```bash
npx tsx scripts/trading-engine.ts --dry-run --no-llm
```

It then records normalized counts and hashes for:

- portfolio hash and open-position counts
- candidate-action counts and signal types
- heatmap CSV row count
- blocked-signal status counts
- closed-trade row count
- dry-run stdout summary counts

When `--compare <baseline.json>` is supplied, the harness compares the new run
against the saved baseline and exits with code `2` on drift. The comparison
ignores `repoHead` so commits that only change cleanup tooling do not fail the
gate by themselves.

The harness restores the dry-run artifact files it temporarily touches:

- `data/candidate-actions.json`
- `data/engine-state.json`
- `data/execution-plan.json`
- `data/llm-truth-state.json`

## Required Gate

For cleanup work, run the harness at least three times:

1. Local baseline before the change.
2. USA VPS baseline before or immediately after the change is available there.
3. Post-change verification using `--compare` against the local or VPS baseline.

Stop if signal counts, candidate-action shape, portfolio hash, blocked-signal counts, or heatmap row count change unexpectedly. Timestamp-only differences are acceptable.
