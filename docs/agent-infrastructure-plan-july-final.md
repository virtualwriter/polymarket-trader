# Agent Infrastructure Plan — July 2026 (final)

Reconciles the original architecture plan (`agent-infrastructure-plan-july.md`)
with the audit of the live system on 2026-07-14. The original plan's diagnosis
is adopted; its build-out is right-sized to what this trader actually is: one
paper-trading research system (~450 counted trades, $1 positions) on a 1GB
VPS, plus a separate sports-arb effort. Written to be executed top to bottom;
each phase is independently shippable and none disturbs live strategies.

---

## Where the original plan was right (verified against production)

1. **"Raw logs reread hourly will eventually kill the system."** It literally
   did: the NO-bias calibration log grew to 240MB and the engine's full-file
   reread OOM-crashed every hourly run from Jul 11–14 (65 crashes, trades not
   closing, portfolio state frozen). Patched with a streaming loader, but the
   file still grows without bound. The plan's distill-then-retrieve design is
   the durable fix.
2. **"The live LLM is not learning, it's remembering."** Confirmed by the
   ledger: raw LLM ideas traded live (`LLM_HYPOTHESIS`) are the worst signal
   in the book (25 trades, -$0.29) while shadow-validated promotions
   (`PROMOTED_HYPOTHESIS`) are +$0.14 over 52. Evidence-gated promotion works;
   ungated LLM trading loses.
3. **"Statistician must be pure code; update beliefs every N trades, not
   every trade."** Already partially embodied here (promotion bars, the
   200-resolved-event calibration gate for NO-bias) and it is the part of the
   system that has consistently produced correct decisions.
4. **"The VPS should be disposable; execution should be separated from
   research."** The Jul 11–14 outage proved the coupling risk: a
   research-side loader took down trade closing and state persistence,
   because everything runs in one hourly process.

## Where the original plan is adjusted, and why

1. **No pgvector / RAG infrastructure yet.** Lesson volume is hundreds, not
   millions. Structured SQL filters (signal type, regime tags, asset) retrieve
   "relevant lessons" fine at this scale. Revisit only if the knowledge base
   exceeds a few thousand entries.
2. **No six-agent split.** The roles are kept (scanner / trader / analyst /
   researcher / statistician / engineer) but mapped onto three processes:
   the hourly execution engine, a nightly research run, and the existing
   deterministic reporting. Six services on a 1GB VPS is operational
   overhead without benefit.
3. **No meta-allocation layer.** With P&L in single dollars there is nothing
   statistically meaningful to allocate between strategies yet. Park it.
4. **"Two bots on two VPSs" is stale.** The Hyperliquid hybrid bot is stopped
   and its real-dollar history belongs to a separate fund (reports already
   normalize it to $1 paper). This plan covers one trader. Sports-arb stays
   its own repo/remote per the existing routing rule.
5. **No big-bang rewrite.** The measurement layer was just debugged
   (shadow force-close artifacts, monotonic accounting, hybrid normalization).
   The clean forward evidence now accumulating — especially the one-touch
   shadow record — must not be reset by a migration. Everything below is
   incremental.

## Current-state findings the plan must incorporate (2026-07-14 audit)

- VPS disk at 99% (299MB free / 23GB). Causes: 6.6GB unused GPU ML stack
  (nvidia CUDA 4.3GB + torch 1.7GB + triton 0.6GB) on a CPU-only box, 1.8GB
  uncapped systemd journals, 1.3GB stale maintenance backups from Jun 25,
  237MB calibration log, 245MB heatmap history.
- Telegram interactive bot (`scripts/telegram-trader-bot.ts`, /status /pnl
  etc.) exists and the token is configured, but no systemd unit runs it —
  chat has never been live.
- LLM provider is DeepSeek (`LLM_PROVIDER=deepseek`, `deepseek-v4-pro`); an
  Anthropic code path already exists, so per-call-site model routing is
  configuration, not surgery.
- The hourly prompt embeds the full learning journal and guidance history —
  the main token cost.
- Close reasons are encoded as appended thesis-string text and pattern-matched
  later (`edge_disappeared` vs `observed_gap_closed`); this already caused one
  measurement bug and blocks clean lesson aggregation.

---

## Phase 0 — Stop the bleeding (day 1, no code)

1. Free the disk: remove the unused nvidia/torch/triton stack after grepping
   that no script imports torch; `journalctl --vacuum-size=300M` plus a
   permanent `SystemMaxUse=300M`; prune Jun 25 maintenance backups; run the
   existing `compact_no_bias_calibration.py --apply`. Expected recovery ~10GB.
2. Add a disk-space line to the daily Telegram report so 99%-full can never
   be a surprise again.

## Phase 1 — Telegram analyst goes live (day 1–2)

1. Ship a systemd service for `telegram-trader-bot.ts` (restart=always,
   memory cap, same env file). Read-only by design, matching the original
   plan: SQL/ledger queries and lesson retrieval, no trade placement, no
   production mutation.
2. Extend commands only after it's stable (e.g. /lessons, /signal <type>).

## Phase 2 — LLM stops trading unvetted ideas (week 1)

1. Route all new `LLM_HYPOTHESIS` output to shadow-only; live entry requires
   passing the same promotion bar as everything else. The LLM's losing
   streak immediately costs $0 while its learning value is preserved.
2. Keep promotion thresholds in pure code (they already are). No LLM opinion
   ever gates a promotion.

## Phase 3 — Structured lessons replace thesis-string archaeology (week 1–2)

1. Add first-class fields on shadow/trade close: `closeReason` (enum),
   `regimeTags`, `reflection` (short structured text), instead of appending
   prose to `thesis` and regexing it later.
2. Backfill the enum for historical records where the thesis text is
   unambiguous; leave the rest untagged rather than guessed.
3. This is the prerequisite for cheap lesson aggregation and retrieval.

## Phase 4 — Nightly research run, separated from execution (week 2–3)

1. Split the hourly engine: execution keeps scanning, entries, exits, shadow
   resolution, state persistence. A new nightly process owns learning sweeps,
   calibration aggregation, lesson generation, journal compaction, and the
   heavier LLM analysis.
2. The nightly run writes two artifacts the hourly engine reads: a small
   calibration-buckets summary (replacing the hourly 240MB scan permanently)
   and a compact lessons file keyed by signal type and regime.
3. Failure isolation rule: the hourly engine must complete even if every
   nightly artifact is missing or stale.

## Phase 5 — Model routing and token diet (week 3–4)

1. Hourly engine: DeepSeek only, and only for summarization/classification
   and open-position close review on LLM-owned positions. Rule-based signal
   exits stop consulting the LLM entirely (they are already deterministic;
   the review call is pure token burn).
2. Nightly research: strongest available model (Anthropic path already in
   code) for hypothesis generation, failure clustering, and strategy
   review — the only call sites where model quality plausibly changes P&L,
   and they run once per day so cost is bounded.
3. Prompt diet: the hourly prompt retrieves only lessons matching the
   current run's active signal families and regime tags, never the full
   journal. Target: order-of-magnitude reduction in hourly tokens.

## Phase 6 — Neon Postgres as the system of record (week 4+, opt-in)

1. Migrate in read-path order: trades ledger → calibration observations →
   shadow records → lessons/knowledge base. Git-committed CSV/JSON stay as
   write-through mirrors until each reader is cut over; nothing is deleted
   until parity is verified.
2. VPS keeps only current state and recent cache; historical data lives in
   Neon. The VPS becomes disposable (recreate from git + env + Neon), which
   was the original plan's Problem-7 goal.
3. Revisit pgvector only if lesson retrieval by SQL filter proves
   insufficient.

## Explicitly deferred

- Meta-allocation across strategies (insufficient sample).
- Vector search / embeddings (insufficient volume).
- LLM-proposed code changes pipeline (keep human-in-the-loop authoring;
  the promotion-bar pattern already covers strategy-parameter evolution).
- Any change to live strategy logic itself — this plan is infrastructure
  only.

## Success criteria

- Disk under 60% with monitoring in place; no unbounded files read by the
  hourly engine.
- Telegram chat answers /status and P&L questions on demand.
- Zero live trades from unpromoted LLM hypotheses; promotion stats untouched.
- Hourly run completes in minutes with an order of magnitude fewer tokens;
  research quality moves to the nightly run instead of disappearing.
- A VPS rebuild from scratch (git + env + Neon) restores full operation with
  no data loss.
