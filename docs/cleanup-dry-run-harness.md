# Cleanup Dry-Run Harness

Use this before and after any codebase cleanup slice that could affect production behavior.

```bash
npm run prod:verify
npm run cleanup:harness -- --out .runtime/cleanup-harness/local-before.json
npm run cleanup:harness -- --out .runtime/cleanup-harness/local-after.json
npm run cleanup:harness -- --compare .runtime/cleanup-harness/local-before.json --out .runtime/cleanup-harness/local-compare.json
```

On the USA VPS, run the same commands from `/opt/polymarket-trader`.

`npm run prod:verify` is read-only. It fails on unresolved git conflicts and
warns about dirty generated/state files, staged changes, and frozen
Japan/monotonic cleanup paths so those do not get bundled into USA cleanup.

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
- stable schema hashes for `candidate-actions.json`, `engine-state.json`,
  `execution-plan.json`, `dry-run-verification.json`, and
  `llm-truth-state.json`
- dry-run stdout summary counts
- before/after git status counts for detecting un-restored dry-run artifacts

When `--compare <baseline.json>` is supplied, the harness compares the new run
against the saved baseline and exits with code `2` on drift. The comparison
ignores `repoHead` so commits that only change cleanup tooling do not fail the
gate by themselves.

The harness also exits with code `3` if the dry run introduces a new dirty path
that was not already dirty before the harness started. Existing dirty generated
state or frozen Japan files are reported in `gitStatus.dirtyBefore` but do not
fail the harness unless the dry run creates additional dirty paths.

The harness restores the dry-run artifact files it temporarily touches:

- `data/candidate-actions.json`
- `data/dry-run-verification.json`
- `data/engine-state.json`
- `data/execution-plan.json`
- `data/llm-advice.json`
- `data/llm-truth-state.json`

## Fixture Replay

Use fixture replay before larger `trading-engine.ts` extractions so the compare
does not depend on live hourly data drift.

```bash
npm run cleanup:harness -- \
  --record-fixture .runtime/cleanup-fixtures/engine-current \
  --snapshot-lines 24 \
  --out .runtime/cleanup-harness/fixture-record.json

npm run cleanup:harness -- \
  --fixture .runtime/cleanup-fixtures/engine-current \
  --out .runtime/cleanup-harness/fixture-baseline.json

npm run cleanup:harness -- \
  --fixture .runtime/cleanup-fixtures/engine-current \
  --compare .runtime/cleanup-harness/fixture-baseline.json \
  --out .runtime/cleanup-harness/fixture-compare.json
```

`--record-fixture` copies the representative runtime inputs used by the engine:
portfolio, trades, hypotheses, blocked signals, learning parameters, signal
weights, macro/valuation CSVs, relative-value CSV/JSON, processed closed trades,
operational taint metadata, and a trimmed tail of `data/instrument-snapshots.jsonl`.
The snapshot tail defaults to 24 non-empty rows and can be changed with
`--snapshot-lines`.

`--fixture` temporarily overlays those inputs, runs the normal dry-run/no-LLM
engine command, records the normalized summary, and restores both fixture inputs
and dry-run artifacts before checking for new dirty paths. Keep fixtures under
`.runtime/` unless an operator explicitly asks to version a compact fixture.

## Required Gate

For cleanup work, run the harness at least three times:

1. Local baseline before the change.
2. USA VPS baseline before or immediately after the change is available there.
3. Post-change verification using `--compare` against the local or VPS baseline.

Stop if signal counts, candidate-action shape, portfolio hash, blocked-signal counts, or heatmap row count change unexpectedly. Timestamp-only differences are acceptable.
