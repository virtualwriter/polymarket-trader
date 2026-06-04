# Codebase Map, Bloat Audit, and Safe Cleanup Plan

**Audience:** Another agent or operator analyzing this repo for performance and maintainability improvements.

**Hard constraint (non-negotiable):** Zero operational change. The hourly trader, minute exit scanner, LLM calls, heatmap generation, monotonic arb paths, and Hyperliquid hybrid bot must continue working exactly as today. Trades must still be made; the LLM must still run.

**Repo:** `polymarket-trader`  
**Last reviewed:** 2026-06-03  
**Production VPS:** Documented in `docs/new-machine-live-handoff.md` and `docs/runtime-state.md`

---

## Executive summary

This repo hosts **two largely independent stacks**:

1. **Production macro/LLM paper trader** (VPS hourly) — the operational system.
2. **Sports market-maker simulation/live stack** — dormant relative to production.

A third subsystem, **Hyperliquid hybrid perp bot**, runs always-on on the VPS independently.

Primary pain points:

- Monolith source files (`trading-engine.ts` ~8k lines, `market-scanner.ts` ~2.5k, heatmap report ~2.4k).
- ~2 GB generated data (`instrument-snapshots.jsonl`) on VPS disk.
- Git-tracked generated blobs growing every hour (journal, hypotheses, heatmap HTML).
- Dual portfolio paths (`portfolio.json` vs `portfolio-live.json`).
- Production wrappers for exit-scanner and daily-report **not versioned in repo**.
- ~45 HL Python scripts; only one is live.

Recommended approach: **quarantine and label first**, then **extract shared libs**, never change trading logic in early phases.

---

## 1. Clean labels — section taxonomy

Use these labels when triaging files. Prefix files or directories in future PRs if helpful.

### A. Production Core (`PROD-*`) — do not break

| Label | Path | Role |
|-------|------|------|
| `PROD-ORCHESTRATOR` | `scripts/run-polymarket-trader.sh` | Hourly VPS pipeline: git sync → scan → heatmap → engine → commit |
| `PROD-SCANNER` | `scripts/market-scanner.ts` | HL + PM + options ingest → `daily-macro.csv`, `daily-valuations.csv`, `instrument-snapshots.jsonl` |
| `PROD-HEATMAP` | `scripts/cross_venue_relative_value_report.py` | Relative-value heatmap → `relative-value/*` |
| `PROD-ENGINE` | `scripts/trading-engine.ts` | Signals, LLM, portfolio, trade execution (**~8,076 lines, ~100 functions**) |
| `PROD-EXIT-SCANNER` | `scripts/position-exit-scanner.ts` | Minute-level exit checks |
| `PROD-DAILY-REPORT` | `scripts/daily_trader_email_report.py` | Daily digest email/Telegram |
| `PROD-MONOTONIC-SHADOW` | `scripts/monotonic-arb-live-scanner.ts` | Paper/shadow monotonic arb |
| `PROD-MONOTONIC-LIVE` | `scripts/polymarket-real-monotonic-executor.ts` | Real PM monotonic (gated by `ENABLE_MONOTONIC_ARB_REAL_PM`) |
| `PROD-HL-HYBRID` | `hyperliquid-crv-rebalancer/multi_coin_hybrid_bot.py` | Always-on HL perp bot ($10 real / $1 shadow log) |
| `PROD-MANUAL-SHADOW` | `scripts/manual_shadow_endpoint.py`, `api/manual-shadow.js` | Manual IV-touch shadow HTTP API |
| `PROD-EDGE` | `api/heatmap-latest.js`, `api/heatmap-refresh.js`, `vercel.json` | Static heatmap hosting + VPS proxy |

**VPS systemd units (documented, not all in repo):**

- `polymarket-trader.timer` → `/usr/local/bin/run-polymarket-trader`
- `polymarket-exit-scanner.timer` → `/usr/local/bin/run-polymarket-exit-scanner` (**wrapper not in repo**)
- `polymarket-daily-report.timer` → `/usr/local/bin/run-polymarket-daily-report` (**wrapper not in repo**)
- `polymarket-manual-shadow.service`
- `hyperliquid-hybrid-bot.service` → `hyperliquid-crv-rebalancer/systemd/hyperliquid-hybrid-bot.service`

Env: `/etc/polymarket-trader.env`  
State: `/var/lib/polymarket-trader` via `POLYMARKET_TRADER_STATE_DIR`

### B. Production State (`STATE-*`) — read/write every hour

| Label | Path | Role |
|-------|------|------|
| `STATE-AUDIT` | `data/portfolio.json`, `data/trades-detailed.csv` | Git-tracked audit ledger |
| `STATE-LIVE` | `$POLYMARKET_TRADER_STATE_DIR/portfolio-live.json` | Production portfolio (VPS) |
| `STATE-LLM` | `data/hypotheses.json`, `data/llm-truth-state.json`, `data/llm-advice.json`, `data/learning-journal.md` | LLM memory & learning |
| `STATE-SHADOW` | `data/blocked-signals.json` | Shadow/blocked signal ledger |
| `STATE-SNAPSHOTS` | `data/instrument-snapshots.jsonl` (~1.6 GB on VPS) | Append-only price/options stream |
| `STATE-HL` | `hyperliquid-hybrid-state.json`, `hyperliquid-hybrid-trades.jsonl` in state dir | HL bot state |
| `STATE-MACRO` | `data/daily-macro.csv`, `data/daily-valuations.csv` | Macro history |
| `STATE-HEATMAP` | `relative-value/cross_venue_relative_value.csv`, `latest.json`, `index.html` | Latest heatmap outputs |

See `docs/runtime-state.md` for full tracked vs ignored file list.

### C. Production Support (`OPS-*`) — not in hourly path

| Label | Path | Role |
|-------|------|------|
| `OPS-REPORT` | `scripts/trader-performance-report.ts` | Desktop CSV / performance rollup |
| `OPS-RECONCILE` | `scripts/reconcile_portfolio_and_ledger.py` | Portfolio vs ledger audit |
| `OPS-SYNC` | `scripts/git-sync.sh`, `scripts/hybrid-sync.sh`, `scripts/sync-runtime-state.sh` | Dev ↔ VPS sync |
| `OPS-COMPACT` | `scripts/compact_instrument_snapshots.py` | Snapshot compaction |
| `OPS-TELEGRAM` | `scripts/telegram-trader-bot.ts` | Manual control bot |
| `OPS-LEDGER` | `scripts/portfolio-ledger.ts` | Shared tainted-trade filtering |

### D. Research / Backtest (`RSH-*`) — safe to isolate

| Label | Path | Role |
|-------|------|------|
| `RSH-FUNDING` | `scripts/funding_*backtest*.py`, `scripts/weekend_*` | Funding rule research |
| `RSH-IV` | `scripts/iv_model_variant_backtest.py`, `relative-value/iv_variant_backtest*.csv` | IV model sweeps |
| `RSH-HEATMAP` | `scripts/heatmap_forward_hold_backtest.py`, `scripts/regime_vs_skill_compare.py` | Heatmap hold/regime studies |
| `RSH-HL-GRID` | `hyperliquid-crv-rebalancer/fee_aware_*.py`, `*_grid*.csv`, `short_vs_hybrid_5x.py`, etc. | HL strategy tuning (~35 scripts) |
| `RSH-ANALYSIS` | `analysis/`, `data/analysis/` | Archived study outputs |
| `RSH-DOCS` | `AI_CAPEX.md`, `docs/quant-model-roadmap.md` | Research notes |

### E. Legacy / Dormant (`LEG-*`) — not in production path

| Label | Path | Role |
|-------|------|------|
| `LEG-SPORTS-MM` | `engine-src/`, `scripts/sports-sim-server.ts`, `scripts/live-trading-server*.ts`, `run-persistent.sh`, `run-sr-monitor.sh` | Sports CLOB market-maker stack |
| `LEG-AUCTION` | `addendum/`, `engine-src/index.ts` | Pre-auction sim (different project context) |
| `LEG-HL-PURR` | `hyperliquid-crv-rebalancer/purr_trend_bot.py` | Old single-coin bot |
| `LEG-CI` | `.github/workflows/daily-snapshot.yml` | Superseded by VPS systemd (manual-only) |
| `LEG-EXPORT` | `scripts/export_paper_trader_csv.py` | GitHub API CSV pull (superseded locally) |
| `LEG-ONE-OFF` | `scripts/espn-score-feeder.sh`, `scripts/quick-buy*.ts`, `scripts/sell-*.ts`, etc. | Ad-hoc trading utilities |

### F. Build / Generated artifacts (`GEN-*`)

| Label | Path | Approx size | Issue |
|-------|------|-------------|-------|
| `GEN-SNAPSHOTS` | `data/instrument-snapshots.jsonl` | ~1.6 GB | Slows sync; not in git |
| `GEN-ARCHIVES` | `data/instrument-snapshot-archives/` | ~365 MB | Local/VPS only |
| `GEN-HEATMAP-HIST` | `relative-value/history/`, `vps-history/` | ~165 MB | Mostly gitignored |
| `GEN-DIST` | `dist/` | ~2.4 MB | Stale compiled TS; prod uses `tsx` |
| `GEN-TRACKED-BLOAT` | `data/learning-journal.md`, `data/hypotheses.json`, `relative-value/index.html` | ~6 MB in git | Grows every hour |

---

## 2. Production hourly pipeline (reference)

```
/usr/local/bin/run-polymarket-trader
  → scripts/run-polymarket-trader.sh
      1. flock (no overlap)
      2. auto-commit interrupted state
      3. move untracked artifacts aside
      4. git pull --autostash
      5. npm install
      6. market-scanner.ts --snapshot
      7. compact_instrument_snapshots.py
      8. cross_venue_relative_value_report.py (+ optional live-quote flags)
      9. polymarket-real-monotonic-executor.ts (if ENABLE_MONOTONIC_ARB_REAL_PM=1)
     10. trading-engine.ts
     11. git commit + push state files
```

Minute path (separate timer): `position-exit-scanner.ts` via VPS wrapper not in repo.

---

## 3. Bloat and redundancy — ranked by pain

### Tier 1 — hurts ops/infra today

1. **Monolith files**
   - `scripts/trading-engine.ts` — 8,076 lines, ~100 functions
   - `scripts/market-scanner.ts` — 2,569 lines
   - `scripts/cross_venue_relative_value_report.py` — 2,408 lines
   - `scripts/trader-performance-report.ts` — 1,513 lines
   - Effect: high-risk changes, slow review, hard to test in isolation

2. **Dual portfolio paths**
   - `data/portfolio.json` (git audit) + `portfolio-live.json` (VPS runtime)
   - Engine dual-writes; exit scanner reads live; reports sometimes read audit
   - Effect: reconciliation overhead, duplicate logic

3. **Production wrappers not versioned**
   - `/usr/local/bin/run-polymarket-exit-scanner`
   - `/usr/local/bin/run-polymarket-daily-report`
   - Effect: infra invisible in git; hard to reproduce

4. **Unbounded snapshot JSONL (~1.6 GB)**
   - Engine reads recent lines only; file grows forever
   - Effect: VPS disk pressure (~92% used at last check), slower I/O

5. **Git-tracked generated blobs**
   - `learning-journal.md`, `hypotheses.json`, `index.html` grow hourly
   - Effect: large commits, merge conflicts on scan outputs

### Tier 2 — cognitive / repo weight

6. **Two trading stacks in one repo** — macro LLM + sports MM share `package.json`
7. **HL research sprawl** — ~45 Python files; one live bot
8. **Backtest script proliferation** — 25+ scripts, overlapping EMA/fee/CSV logic
9. **Report generator overlap** — 4 scripts re-implement portfolio/hybrid/shadow stats
10. **Env loading chaos** — `config.env`, `.env`, `/etc/polymarket-trader.env`; `CLOB_URL` vs `CLOB_API_URL`; HL mnemonic vs agent key

### Tier 3 — dead weight (safe to quarantine)

11. `addendum/` — auction sim, different project
12. `dist/` — unused in production (`tsx` runs source directly)
13. `purr_trend_bot.py`, `espn-score-feeder.sh` — hardcoded/unused
14. GitHub Actions hourly workflow — manual-only, duplicates VPS systemd
15. Duplicate CLOB deps: `@polymarket/clob-client` and `@polymarket/clob-client-v2`

---

## 4. Shadow vs live paths (do not merge)

| Concern | Shadow | Live |
|---------|--------|------|
| Portfolio | N/A (blocked signals) | `portfolio.json` + `portfolio-live.json` |
| Monotonic arb | `monotonic-arb-live-scanner.ts` → `blocked-signals.json` | `polymarket-real-monotonic-executor.ts` → real CLOB |
| HL hybrid | $1 shadow in JSONL | $10 real fills on HL |
| Engine modes | `--dry-run`, `--shadow-architecture` | Default production |
| Heatmap | `relative-value/latest.json` (static/Vercel) | `latest-live.json` (VPS, gitignored) |

---

## 5. Safe cleanup plan (phased)

Each phase has a **verification gate**: run hourly pipeline with `--dry-run` where supported; compare portfolio hash, heatmap row count, LLM output shape, and journal logs before/after.

### Phase 0 — Guardrails (1 day, zero code change)

| Action | Risk |
|--------|------|
| This document + optional `CODEBASE.md` pointer | None |
| Pull VPS wrappers into repo as `scripts/run-polymarket-exit-scanner.sh`, `scripts/run-polymarket-daily-report.sh` | None (copy-only) |
| Document systemd units in `docs/systemd/` | None |
| Snapshot production state hashes (portfolio, blocked-signals count, HL state) | None |

**Gate:** No service restarts.

### Phase 1 — Quarantine legacy code (2–3 days, zero runtime impact)

| Action | How | Ops impact |
|--------|-----|------------|
| Move `addendum/` → `archive/addendum/` | Git move | None |
| Move sports stack → `archive/sports-mm/` | Git move; optional separate `package.json` | None — not in VPS path |
| Move HL research → `hyperliquid-crv-rebalancer/research/` | Git move; keep live bot + systemd at top level | None — systemd path unchanged |
| Move one-off trade CLIs → `scripts/manual/` | Git move | None |
| Remove `dist/` from tracking; ensure gitignored | Build artifact | None — prod uses `tsx` |
| Add `# @deprecated-not-in-prod` headers to `LEG-*` files | Comments only | None |

**Gate:** `run-polymarket-trader.sh` dry-run on VPS; no HL bot restart required.

### Phase 2 — Data & git weight (3–5 days, zero logic change)

| Action | How | Ops impact |
|--------|-----|------------|
| Snapshot rotation policy on VPS | Weekly `compact_instrument_snapshots.py`; 30d hot + archive | Engine reads recent lines only |
| Stop git-tracking `index.html` (optional) | `.gitignore`; VPS still generates | Vercel deploy path must stay valid |
| Cap `learning-journal.md` growth | Archive old sections; preserve LLM window | LLM context unchanged if window preserved |
| Move `relative-value/history/` off root disk | Symlink or external volume | None |
| Consolidate git-sync artifact manifest | Single file vs hardcoded arrays | None |

**Gate:** Same heatmap CSV row count and engine signal count after one hourly run.

### Phase 3 — Extract shared libs from monoliths (2–3 weeks, behavior-identical)

| Extract from | Into | Entrypoint unchanged |
|--------------|------|----------------------|
| `trading-engine.ts` | `lib/state/`, `lib/signals/`, `lib/llm/`, `lib/polymarket/`, `lib/learning/` | `trading-engine.ts` re-exports / orchestrates |
| `market-scanner.ts` | `lib/scanner/{hyperliquid,polymarket,options}.ts` | `market-scanner.ts` orchestrates |
| `cross_venue_relative_value_report.py` | `relative_value/` Python package | CLI wrapper unchanged |
| Backtest scripts | `research/lib/backtest_core.py` | Scripts import shared lib |
| Report scripts | `lib/reports/portfolio_stats.ts` | Same CSV/output shapes |

**Rules:**

- No function signature changes in Phase 3
- No env var renames
- One extraction per PR + dry-run diff test
- Keep production entrypoints as thin orchestrators

**Gate:** Byte-identical `portfolio.json` + `trades-detailed.csv` after dry-run hour (or documented acceptable diff).

### Phase 4 — Infra hardening (1 week, zero trading logic change)

| Action | Benefit |
|--------|---------|
| Deploy versioned VPS wrappers from repo | Infra changes in git |
| Single env loader (`lib/env.ts`, `lib/env.py`) | One place for state dir, CLOB URL, LLM keys |
| Deprecate `HYPERLIQUID_MNEMONIC` code path (keep read + warning) | Remove dead branch after agent migration |
| Document monotonic env mapping in one module | Less env confusion |
| Add `npm run prod:verify` smoke script | Pre-deploy checks |

**Gate:** Full hourly run on VPS; compare journal logs with prior run.

### Phase 5 — Optional long-term (explicit approval only)

| Action | Why wait |
|--------|----------|
| Split repo: prod vs research | CI/deploy path changes |
| Unify to single portfolio file | State model change; high risk |
| Compiled `dist/` in prod instead of `tsx` | Deploy complexity |
| Remove `@polymarket/clob-client-v2` | Requires import audit |

---

## 6. Do not touch (even if bloated)

| Item | Reason |
|------|--------|
| Signal/LLM decision logic inside `trading-engine.ts` | Alters trades |
| `run-polymarket-trader.sh` git pull/autostash flow | Historically fragile |
| Dual-write portfolio pattern | Exit scanner depends on live file |
| Shadow vs live monotonic separation | Real PM is env-gated |
| HL hybrid live params (EMA, cooldown, universe) | Validated live config |
| Hourly auto-commit of state files | Recovery mechanism |

---

## 7. Expected gains (after Phases 1–4)

| Metric | Today (approx) | Target |
|--------|----------------|--------|
| Files in prod path | ~15 + ~45 HL scripts | ~15 + ~3 HL scripts |
| Largest source file | ~8,076 lines | ~1,500 orchestrator + libs |
| VPS snapshot disk | ~2 GB unbounded | ~200 MB hot + archives |
| Hourly git commit size | ~6 MB tracked blobs | ~500 KB (if capped) |
| Prod surface discoverability | Hunt 250+ files | Label taxonomy + this doc |

---

## 8. Suggested first execution slice for next agent

Start with **Phase 0 + Phase 1 only**:

1. Add pointer from `README.md` or `docs/runtime-state.md` to this document
2. SSH-copy VPS exit-scanner and daily-report wrappers into `scripts/`
3. Move `addendum/` and sports stack to `archive/`
4. Move HL research scripts to `hyperliquid-crv-rebalancer/research/`

No service restarts. No logic changes. No impact on hourly trader or LLM.

---

## 9. Key file size reference (lines of code)

| File | Lines |
|------|------:|
| `scripts/trading-engine.ts` | 8,076 |
| `scripts/market-scanner.ts` | 2,569 |
| `scripts/cross_venue_relative_value_report.py` | 2,408 |
| `scripts/trader-performance-report.ts` | 1,513 |
| `hyperliquid-crv-rebalancer/multi_coin_hybrid_bot.py` | 1,052 |
| `scripts/position-exit-scanner.ts` | 423 |

| Directory | Size |
|-----------|------|
| `data/` | ~2.0 GB |
| `relative-value/` | ~165 MB |
| `scripts/` | ~1.5 MB source |
| `hyperliquid-crv-rebalancer/` | ~7 MB |

---

## 10. Related docs

- `docs/runtime-state.md` — tracked vs ignored state files
- `docs/new-machine-live-handoff.md` — VPS systemd and env setup
- `docs/hybrid-strategy-context.md` — HL hybrid bot context for LLM
- `docs/quant-model-roadmap.md` — strategy research roadmap
- `hyperliquid-crv-rebalancer/README.md` — HL subsystem overview

---

## 11. Revised execution plan (second-pass review, 2026-06-03)

After a second review against the actual production wrapper (`scripts/run-polymarket-trader.sh`), `vercel.json`, and `package.json`, the original Phase 0/1 above is **too aggressive** for the "business as usual" constraint. The notes below override the original phases.

### Confirmed operational risks the original plan understated

1. **Vercel serves `relative-value/` directly.** `vercel.json` has `"buildCommand": "true"` and `"outputDirectory": "relative-value"`. Untracking `relative-value/index.html` without changing the Vercel deploy will break the public heatmap. **Do not untrack it.**
2. **Sports stack moves break npm scripts.** `engine-src/`, `scripts/sports-sim-server.ts`, `scripts/live-trading-server*.ts`, `run-persistent.sh`, `run-sr-monitor.sh` are referenced **only** in `package.json` (not in the wrapper, HL systemd, or Vercel). Moving them does not touch the trader, but breaks `npm run sim`, `npm run server`, `npm run build`, `npm run start`. Treat any move as an explicit accepted break.
3. **Snapshot compaction is already production.** `scripts/run-polymarket-trader.sh` line 187 already calls `compact_instrument_snapshots.py`. The work is retention policy + offloading archives, not "add compaction."
4. **Wrapper has hardcoded allowlists.** `scripts/run-polymarket-trader.sh` contains:
   - `DATA_FILES` array (~lines 35–56) — files auto-committed every hour.
   - `move_generated_untracked_artifacts` whitelist (~lines 76–81) — directories scanned for stray artifacts.
   - `robust_git_pull_rebase` — last-resort untracked-file recovery.
   Any rename or directory move in scope of these lists must update the wrapper in the same PR.

### Safe-now execution slice (zero operational risk)

This replaces the original Phase 0 + Phase 1. Each item is **documentation, copy-only, or read-only verification**. No service restarts.

1. **Treat this document as a plan, not an approved sequence.** Tag the original phases as "draft" mentally; the safe slice below is the actual go-ahead set.
2. **Copy VPS wrappers into the repo** (`scp` from VPS, commit only):
   - `scripts/run-polymarket-exit-scanner.sh` ← `/usr/local/bin/run-polymarket-exit-scanner`
   - `scripts/run-polymarket-daily-report.sh` ← `/usr/local/bin/run-polymarket-daily-report`
   No deployment change; VPS keeps using `/usr/local/bin/*` until we explicitly redeploy.
3. **Snapshot systemd units to `docs/systemd/`** by `scp`-ing the actual unit files from the VPS (`polymarket-trader.{service,timer}`, `polymarket-exit-scanner.{service,timer}`, `polymarket-daily-report.{service,timer}`, `polymarket-manual-shadow.service`). Reference only; no install step.
4. **Add per-directory README/header notes** for `LEG-*` paths in place. No moves:
   - `engine-src/README.md`: "Legacy sports MM engine; not in production trader path."
   - `scripts/sports-*.ts` header comment: same.
   - `addendum/README.md`: "Auction sim from a separate project; not loaded by hourly trader."
   - `hyperliquid-crv-rebalancer/README.md` addendum: enumerate which `.py` files are research vs `multi_coin_hybrid_bot.py` (live).
5. **Add `npm run prod:verify` (read-only checks):**
   - Required env vars present (`ANTHROPIC_API_KEY`, `POLYMARKET_TRADER_STATE_DIR` if set on VPS).
   - State dir writable.
   - Wrapper script exists at `/usr/local/bin/run-polymarket-trader`.
   - HL agent + master address match `test_hl_agent_setup.py` (already exists).
   - Disk usage on `$STATE_DIR` mount printed.
   No file mutations.
6. **VPS disk health check (read-only):** capture and document current sizes of `instrument-snapshots.jsonl`, `instrument-snapshot-archives/`, `relative-value/history/`. Decide retention policy in a follow-up, do not delete now.

### Explicit do-not-do in the first slice

- **Do not move** `addendum/`, sports scripts, or HL research directories.
- **Do not untrack** `relative-value/index.html` or any other Vercel-served file.
- **Do not cap or rotate** `learning-journal.md` until the LLM prompt-window logic in `trading-engine.ts` has been mapped and a deterministic gate exists.
- **Do not change** `npm ci` to conditional install. Keep the safe-but-slow install.
- **Do not edit** the wrapper's `DATA_FILES` array or allowlists in this slice.
- **Do not refactor** `trading-engine.ts`, `market-scanner.ts`, or the heatmap report until a golden-output harness exists (Phase 3 prerequisite).

### Prerequisites for any future "Phase 3" (monolith split)

Before extracting modules from `trading-engine.ts` or `market-scanner.ts`:

1. **Golden harness:** record one full hourly run's inputs (snapshot file, heatmap CSV, env). Replay with `--dry-run` (or LLM-disabled) and capture: `candidate-actions.json`, signal counts, portfolio diff, `data/learning-journal.md` delta shape.
2. **CI gate:** every PR runs the harness; output diff must be byte-identical or in a documented allowlist (timestamps, RNG-free sections).
3. **No env renames, no path renames** in the same PR as code extraction.

### Future moves that need wrapper coordination

If/when these are approved, the **same PR** must update `scripts/run-polymarket-trader.sh`:

- Renaming any file in `DATA_FILES` (lines ~35–56) → update array.
- Creating new top-level dirs (`archive/`, etc.) that could collect untracked artifacts on the VPS → add to `move_generated_untracked_artifacts` whitelist (lines ~76–81).
- Changing any path the engine reads (`data/instrument-snapshots.jsonl`, `data/portfolio.json`, etc.) → reflected in `trading-engine.ts`, `position-exit-scanner.ts`, and the wrapper together.

### Sign-off rule

Any single change beyond the "safe-now execution slice" above requires explicit approval and a passing dry-run on the VPS. If a future agent reads only this document, the **only items it should execute without further approval are items 2–6 of the safe-now slice**.

---

## 12. Agent checklist before any change

- [ ] Is the file labeled `PROD-*` or on the hourly pipeline path?
- [ ] Will the change alter signal generation, LLM prompts, or order sizing?
- [ ] Will the change alter env var names read on the VPS?
- [ ] Will the change alter paths read by systemd units?
- [ ] Is there a `--dry-run` or diff test gate defined?
- [ ] Can this be done as git move / comment-only first?

If any answer is "yes" for prod path without a gate, **stop and escalate**.
