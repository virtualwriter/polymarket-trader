#!/usr/bin/env python3
"""Assemble the informed-flow study report from test result JSONs.

Writes relative-value/flow-study/report.md plus a per-market CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path


def fmt_pct(x, digits=1):
    return "n/a" if x is None or x != x else f"{x * 100:.{digits}f}%"


def fmt(x, digits=3):
    return "n/a" if x is None or x != x else f"{x:.{digits}f}"


def verdict(p, supports: bool) -> str:
    if p is None or p != p:
        return "inconclusive (no data)"
    if p < 0.05:
        return "SUPPORTED (p<0.05)" if supports else "REJECTED (significant opposite)"
    if p < 0.15:
        return "weakly supported" if supports else "weakly against"
    return "inconclusive"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    args = parser.parse_args()
    root = Path(args.repo_root)
    res_dir = root / "data" / "flow-study" / "results"

    flow = json.loads((res_dir / "informed_flow_results.json").read_text())
    lead = json.loads((res_dir / "lead_lag_results.json").read_text())
    skill = json.loads((root / "data" / "flow-study" / "wallet_skill.json").read_text())
    manifest = json.loads((root / "data" / "flow-study" / "manifest.json").read_text())

    ss = flow["smart_share"]
    pl = flow["predictive_lift"]
    sf = flow["size_freshness"]
    rc = flow["regime_control"]

    n_complete = sum(1 for v in manifest.values() if v.get("status") == "complete")
    total_trades = sum(v.get("n_trades", 0) for v in manifest.values())
    n_trunc = sum(1 for v in manifest.values() if v.get("truncated"))

    smart_diff = ss["smart_share_diff"]
    dumb_diff = ss["dumb_share_diff"]
    usd_diff = sf["usd_median_diff"]
    age_diff = sf["age_median_diff"]
    h24 = lead["horizons"]["h24"]
    h72 = lead["horizons"]["h72"]

    smart_supports = smart_diff["diff"] > 0
    lines = [
        "# Informed Flow Study: Are Dip Buyers Smart Money?",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        "",
        "## Theory",
        "Dip-contract YES flow is informed (hedgers / macro fear with signal); high-contract YES flow is",
        "lottery money. Tested with wallet-level tapes plus market-level lead-lag and regime controls.",
        "",
        "## Data",
        f"- {n_complete} resolved touch/settlement markets pulled; {total_trades:,} trades; {n_trunc} tapes truncated by API cap",
        f"- {skill['n_wallets']:,} unique wallets, {skill['n_records']:,} wallet-market records across {skill['n_markets']} touch markets",
        "",
        "## 0. Precondition: is wallet skill persistent (not luck)?",
        f"- Wallets with >=5 markets in each half: {skill['persistence_eligible_wallets']}",
        f"- Spearman(ROI first half, ROI second half) = {fmt(skill['persistence_spearman'])}",
        "",
        "## 1. Smart-share test (walk-forward classified wallets)",
        f"- Mean smart share of net-YES exposure: dips {fmt_pct(ss['smart_share_dips'])} vs highs {fmt_pct(ss['smart_share_highs'])}"
        f" (diff {fmt_pct(smart_diff['diff'])}, 95% CI [{fmt_pct(smart_diff['lo'])}, {fmt_pct(smart_diff['hi'])}], p={fmt(smart_diff['p'])})",
        f"- Mean dumb share: dips {fmt_pct(ss['dumb_share_dips'])} vs highs {fmt_pct(ss['dumb_share_highs'])}"
        f" (diff {fmt_pct(dumb_diff['diff'])}, p={fmt(dumb_diff['p'])})",
        f"- Smart-cohort net stance agrees with resolution: {ss['smart_stance_agree']['k']}/{ss['smart_stance_agree']['n']}"
        f" = {fmt_pct(ss['smart_stance_agree']['rate'])} (CI {fmt_pct(ss['smart_stance_agree']['lo'])}-{fmt_pct(ss['smart_stance_agree']['hi'])})",
        f"- Dumb-cohort net stance agrees: {ss['dumb_stance_agree']['k']}/{ss['dumb_stance_agree']['n']}"
        f" = {fmt_pct(ss['dumb_stance_agree']['rate'])}",
        f"- Verdict: {verdict(smart_diff['p'], smart_supports)}",
        "",
        "## 2. Predictive lift (entry-time flow beyond PM price)",
        f"- Walk-forward scored markets: {pl['n_scored']} (of {pl['n_rows']})",
        f"- AUC price-only {fmt(pl['auc_price_only'])} vs price+flow {fmt(pl['auc_price_plus_flow'])}",
        f"- Log-loss price-only {fmt(pl['logloss_price_only'])} vs price+flow {fmt(pl['logloss_price_plus_flow'])}",
        f"- Markets with nonzero classified flow at entry: {fmt_pct(pl['flow_nonzero_share'])}",
        "",
        "## 3. Size fingerprint (YES-token buys)",
        f"- Median YES-buy: dips ${fmt(sf['yes_buy_usd_dips']['median'], 2)} vs highs ${fmt(sf['yes_buy_usd_highs']['median'], 2)}"
        f" (diff ${fmt(usd_diff['diff'], 2)}, p={fmt(usd_diff['p'])})",
        f"- Share of YES-buys <= $10: dips {fmt_pct(sf['yes_buy_usd_dips']['share_le_10'])} vs highs {fmt_pct(sf['yes_buy_usd_highs']['share_le_10'])}",
        f"- YES-buys per market (median): dips {fmt(sf['yes_buys_per_market_dips']['median'], 0)} vs highs {fmt(sf['yes_buys_per_market_highs']['median'], 0)}",
        "",
        "## 4. Wallet freshness (account age at YES-buy)",
        f"- Median age: dips {fmt(sf['wallet_age_days_dips']['median'], 1)}d vs highs {fmt(sf['wallet_age_days_highs']['median'], 1)}d"
        f" (diff {fmt(age_diff['diff'], 1)}d, p={fmt(age_diff['p'])})",
        f"- Share of buys from wallets < 7 days old: dips {fmt_pct(sf['age_share_lt_7d_dips'])} vs highs {fmt_pct(sf['age_share_lt_7d_highs'])}",
        f"- Age coverage: {sf['age_coverage']['with_age']:,}/{sf['age_coverage']['total']:,} trades",
        "",
        "## 5. Lead-lag (market-level, no wallets)",
        "Event: PM-vs-model gap widens >=2 pts in 1h with PM rising. Forward spot return vs asset baseline.",
        f"- Dip richening, 24h: {fmt(h24['dip_yes_richening']['diff_vs_baseline_pct'], 2)}% vs baseline"
        f" (p={fmt(h24['dip_yes_richening']['p'])}) -> spot falls after dip fear: {verdict(h24['dip_yes_richening']['p'], h24['dip_yes_richening']['diff_vs_baseline_pct'] < 0)}",
        f"- Dip richening, 72h: {fmt(h72['dip_yes_richening']['diff_vs_baseline_pct'], 2)}% (p={fmt(h72['dip_yes_richening']['p'])})",
        f"- High richening, 24h: {fmt(h24['high_yes_richening']['diff_vs_baseline_pct'], 2)}% vs baseline"
        f" (p={fmt(h24['high_yes_richening']['p'])}) -> informed would be positive; negative/flat = chasing",
        f"- High richening, 72h: {fmt(h72['high_yes_richening']['diff_vs_baseline_pct'], 2)}% (p={fmt(h72['high_yes_richening']['p'])})",
        "",
        "## 6. Regime control (trailing 7d spot trend at entry)",
    ]
    for regime in ("down", "up"):
        r = rc.get(regime, {})
        lines.append(
            f"- {regime}-tape: dips n={r.get('n_dips')} hit {fmt_pct(r.get('dip_hit_rate'))}, highs n={r.get('n_highs')}"
            f" hit {fmt_pct(r.get('high_hit_rate'))}; smart share dips {fmt_pct(r.get('smart_share_dips'))}"
            f" vs highs {fmt_pct(r.get('smart_share_highs'))}"
        )
    lines += [
        "",
        "## Caveats",
        "- Wallet skill measured only within these markets (not full Polymarket history).",
        "- Tapes are taker fills from the public data API; a few high-volume tapes truncated at the 10k cap.",
        "- Sample period (May-Jul 2026) was mostly a falling tape; regime split above is the control.",
        "",
    ]

    out_dir = root / "relative-value" / "flow-study"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.md").write_text("\n".join(lines))

    per_market = [json.loads(l) for l in (res_dir / "per_market_shares.jsonl").open()]
    if per_market:
        with (out_dir / "per_market_shares.csv").open("w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(per_market[0].keys()))
            writer.writeheader()
            writer.writerows(per_market)

    print(f"wrote {out_dir / 'report.md'}")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
