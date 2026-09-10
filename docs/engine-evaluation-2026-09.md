# Trading Engine Evaluation — September 2026

Prepared as a handoff document for external assessment. All numbers pulled from
the live system (VPS ledger, hypothesis store, findings registry, git history)
on 2026-09-10.

---

## 1. What this system is

An autonomous, self-improving research-and-trading organism for prediction
markets and crypto derivatives. It paper-trades Polymarket binary contracts and
Hyperliquid perpetuals with real market data, but its actual product is not the
P&L — it is a compounding library of statistically validated trading knowledge,
produced by machinery that generates, tests, kills, and promotes its own ideas
with no human in the loop.

**Core stack:**

- **Hourly trading engine** (`trading-engine.ts`, ~9,500 lines TypeScript):
  ingests live quotes from Polymarket CLOB/gamma, Hyperliquid, Deribit options,
  and TradingView futures/options scanners; evaluates promoted signals; manages
  positions with structured close triggers; records everything (including every
  trade it *declined* to take) to an append-only ledger.
- **Nightly research stack** (Python + TypeScript): three statistical miners, a
  findings registry, an FDR-controlled opportunity ranker, an LLM research
  analyst, and (as of Sep 10) a free-roaming LLM data explorer.
- **Data archives** it owns: 12,600+ contract-day outcome panel with ~30
  features each, a spot/perp forward-return panel, 40k rows of funding history,
  daily cross-venue IV valuations, macro composites, 975 closed trades, and
  1,380 shadow (counterfactual) trade records.

**The learning loops, from fastest to slowest:**

1. **Hourly — shadow learning.** Every blocked signal is tracked to its
   counterfactual outcome. A digest (with correlation-honest weekend
   clustering) feeds the nightly analyst, which can move bounded learnable
   parameters (e.g. the weekend-funding entry band, ±0.05/night within
   [-0.75, -0.25]).
2. **Nightly — hypothesis lifecycle.** Miners stratify the panels (base rates,
   temporal holdout, Benjamini-Hochberg correction) into FIND records; a
   ranker scores them (opportunity × Wilson confidence × q-value); an LLM
   authors up to 10 hypotheses from ranked FINDs plus refinements of diagnosed
   failures, and a second explorer session authors up to 3 freeform ideas from
   open-ended archive scans. Every idea faces the same gauntlet: catalog-valid
   conditions, verdict-time caps, too-rare trigger rejection, then ~20 forward
   shadow tests on distinct contracts.
3. **Weekly-to-monthly — promotion.** Families that survive (e.g. 20 deduped
   group tests, 65% wins, p<0.01 expectancy) are promoted to live signals;
   failures are killed with recorded post-mortems, and rejection reasons are
   fed back into the next night's authoring prompt so the LLM stops proposing
   dead ideas.

**Statistical discipline is the load-bearing wall.** Nothing promotes on raw
win counts: contract theses are graded against the pool's own empirical base
rate (a NO at 80c winning 80% of the time is zero edge), overlapping
same-contract test windows are deduplicated, weekend-correlated funding losses
are clustered into single observations, and operationally tainted trades are
quarantined from all learning.

**Current state (2026-09-10):** 975 closed paper trades (net +$5.55 at
deliberately tiny stakes — the ledger is a measurement instrument, not a
bankroll); 728 hypotheses authored to date (231 active, 389 killed, 108
archived) across 1,988 recorded tests; 845 registry records including 71
formal FINDs; two promotion campaigns in flight — the "panel mid-band NO"
group at 7/20 deduped tests (71% wins, +39.8% mean) tracking promotion around
Sep 18–20, and "BTC one-touch moderate-edge NO" at 7/20 (7W/0L, +39.6%).

---

## 2. Month-by-month chronology

**April 2026 — a scanner with opinions.** Initial commit Apr 3: a Polymarket
CLOB toolkit and multi-source scanner (Hyperliquid, Polymarket, CME/CBOE
options via TradingView). Added implied-EV and cross-source discrepancy
analysis, and — the seed of everything that followed — began tracking
untaken trades as shadow positions "for learning." 83 closed trades. Human
picked the trades; the machine priced them.

**May 2026 — signals and self-doubt.** First signal taxonomy: one-touch
directional decoder (terminal-price vs path-dependent contracts), weekend
funding windows, stale-lottery-ticket NOs. First fee-aware backtest grid
search. First artifact quarantine (strike-IV-skew artifacts blocked
symmetrically). The manual `USER_PM_IV_TOUCH_RICH_NO` trades this month (9/10
winners) later became the thesis the machine re-derived on its own. 90 trades.

**June 2026 — first autonomous promotion.** The monotonic-arbitrage strategy
went shadow → live through a promotion gate, with real CLOB order routing
built (VPN guard, proxy-wallet collateral preflight, order books archived at
open). A cooldown-persistence bug and a weekend-funding stop override bug were
found and fixed — the month the system learned its own execution could be the
enemy. 165 trades.

**July 2026 — the research factory.** The infrastructure month: research scoring
made "statistically principled" (the commit's own words), a validated
condition-key catalog linking LLM output to engine-evaluable expressions,
structured close triggers replacing thesis-string archaeology, a findings
registry with confidence calibration and a reproducible experiment runner, the
nightly research report to Telegram. The nightly LLM went from commentator to
component. 256 trades.

**August 2026 — mining at scale.** The decisive shift from "learn from your
own trades" to "learn from everything": outcome-panel mining sourced research
from the *full contract history* (thousands of contract-days, not hundreds of
shadows), plus a spot/perp panel graded on the engine's own exam. Hypothesis
intake widened 3→10/night behind FDR control; concurrent shadow tests on
distinct contracts; admission criteria based on how fast an idea can be
*decided*. A standing budget split edge-sharpening vs new-strategy discovery.
Also the month of infrastructure pain: the nightly loop died twice on
timeout/OOM and was hardened. 310 trades.

**September 2026 (first 10 days) — closing the loops.** The shadow-learning
digest became a persistent hourly artifact feeding the nightly prompt, with
the weekend-funding entry band exposed as a bounded learnable parameter. A
subtle evidence-inflation bug (duplicate pending tests on the same contract
within a promotion group) was found and fixed. Then the explorer: a second
nightly LLM session with free-roaming query access to every archive
(`dataset_scan`: any column, any grouping, minimum-sample floors), a 3-slot
freeform hypothesis budget exempt from FIND-linkage but not from testing, the
power to propose new miner stratifications, a known-cluster "rediscovery is a
null result" list, and a mandatory 6-night focus rotation across the archives.
Its first steered session (funding-history focus) immediately surfaced
conditional effects nobody had programmed it to find: low funding z-score
turns OIL bearish (−1.8%/3d, n=28 vs +0.14% base); high z-score inverts HYPE
against its own uptrend (−2.6% vs +4.7% base).

---

## 3. Where it is going

**Weeks:** the two promotion campaigns reach their 20-test gates (mid-band NO
~Sep 18–20). First explorer-authored hypotheses (funding-regime conditionals)
enter shadow testing with `origin: explorer` tags. Miner runs begin testing
the eight funding-crossed stratifications the explorer proposed.

**One to two months:** the origin-tagging makes a measurable comparison
available — do free-roaming ideas hit at a rate that justifies a bigger
freeform budget, or is the archive mined out? Either answer changes the
architecture. Novel interaction FINDs (funding × weekday, liquidity tiers,
macro states) are the explicit target, with the search steering built to
surface one within a month.

**The trajectory it is on:** each layer added has moved the system one level
up the abstraction stack — from executing trades (April), to testing signals
(May–June), to manufacturing hypotheses (July–August), to *choosing what to
research* (September). The remaining rungs are visible in its own data:
per-origin capital allocation once promoted families exist in numbers, regime
detection (its archives now span only ~4 months of one market regime — its
biggest epistemic blind spot), and proposing new data feeds rather than new
cuts of existing ones. The testing gauntlet is designed to stay fixed while
everything upstream of it gets more creative — rigor as the constitution,
exploration as the legislature.

---

## 4. Honest limitations

- Net paper P&L (+$5.55 over 975 trades) is noise-level by design (tiny
  stakes); the validated per-trade edges in the promotion pipeline (+39% mean
  on deduped group tests) are the real signal, but remain paper-only.
- Zero hypothesis-level promotions to live signals so far; the two campaigns
  in flight would be the first fully machine-manufactured ones.
- Four months of data, one macro regime, no adversarial liquidity testing
  (paper fills assume the quoted book).
- The LLM layer is a single model (deepseek-v4-pro) with no ensemble or
  adversarial review of its authored theses beyond the statistical gates.

---

## 5. Prompt for the assessing agent

> You are given an evaluation document describing a software system built
> between April and September 2026. Your task is to assess **what kind of
> technology is actually being built here** — classify it honestly, without
> flattery or dismissal.
>
> Specifically:
> 1. **Taxonomy.** Is this best understood as (a) an algorithmic trading bot,
>    (b) an automated research/discovery platform, (c) a self-improving agent
>    system with a trading substrate, or (d) something else? Argue from the
>    architecture, not the domain.
> 2. **The learning claim.** The system claims compounding self-improvement
>    via layered feedback loops (hourly counterfactual tracking, nightly
>    hypothesis manufacture with statistical gates, promotion/kill cycles,
>    and now self-directed exploration of its own archives). Evaluate whether
>    the described mechanisms constitute genuine open-ended learning or a
>    bounded optimization process, and identify what evidence would
>    distinguish the two within the next 60 days.
> 3. **The interesting part.** Identify which single architectural decision
>    in this system is most novel or most load-bearing relative to typical
>    quant-trading or LLM-agent systems (candidates: the counterfactual
>    shadow ledger; grading against empirical base rates rather than win
>    rates; the FIND-linkage requirement with a small tagged freeform budget;
>    the fixed statistical gauntlet with an increasingly creative generator
>    upstream; origin-tagged hit-rate accounting between mined and explored
>    ideas).
> 4. **Trajectory.** Given the month-by-month progression (execution → signal
>    testing → hypothesis manufacture → research self-direction), what is the
>    natural next abstraction layer, and what are the two most likely failure
>    modes of this trajectory (technical or epistemic)?
> 5. **Verdict.** In one paragraph: what technology is this, what is it worth
>    if the trajectory holds, and what single change would most increase the
>    probability it becomes what its architecture implies it wants to be?

---

*Prepared 2026-09-10. Sources: git history (4,630 commits), live VPS state
(`data/trades-detailed.csv`, `hypotheses.json`, `registry.json`,
`blocked-signals.json`), promotion-group evaluators, and the nightly research
reports.*
