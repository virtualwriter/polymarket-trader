#!/usr/bin/env python3
"""Informed-flow hypothesis tests on wallet trade tapes.

Tests (see plan "Informed Flow Study"):
1. smart-share: is net YES exposure on dips held more by walk-forward
   "smart" wallets than on highs?
2. predictive lift: does smart-vs-dumb net YES positioning at entry improve
   resolution prediction beyond the PM price?
3. size fingerprint: YES-buy trade size distributions, highs vs dips.
4. freshness: wallet account age of YES buyers, highs vs dips.
5. regime control: do the headline asymmetries survive splitting by the
   trailing 7d spot trend at entry?

Writes data/flow-study/results/informed_flow_results.json and prints a
readable summary.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

random.seed(42)

MIN_PRIOR_MARKETS = 5
SMART_ROI = 0.10
DUMB_ROI = -0.10
NBOOT = 4000


# ---------- small stats helpers ----------

def mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def median(xs: List[float]) -> float:
    if not xs:
        return float("nan")
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def wilson(k: int, n: int, z: float = 1.96) -> Tuple[float, float, float]:
    if n == 0:
        return float("nan"), float("nan"), float("nan")
    p = k / n
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0.0, center - half), min(1.0, center + half)


def bootstrap_diff(a: List[float], b: List[float], stat=mean, nboot: int = NBOOT) -> Dict[str, float]:
    """CI and two-sided p for stat(a) - stat(b) via independent resampling."""
    if not a or not b:
        return {"diff": float("nan"), "lo": float("nan"), "hi": float("nan"), "p": float("nan")}
    obs = stat(a) - stat(b)
    diffs = []
    for _ in range(nboot):
        ra = [a[random.randrange(len(a))] for _ in range(len(a))]
        rb = [b[random.randrange(len(b))] for _ in range(len(b))]
        diffs.append(stat(ra) - stat(rb))
    diffs.sort()
    lo, hi = diffs[int(0.025 * nboot)], diffs[int(0.975 * nboot)]
    if obs >= 0:
        p = 2 * sum(1 for d in diffs if d <= 0) / nboot
    else:
        p = 2 * sum(1 for d in diffs if d >= 0) / nboot
    return {"diff": obs, "lo": lo, "hi": hi, "p": min(1.0, p)}


def auc(scores: List[float], labels: List[int]) -> Optional[float]:
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        return None
    wins = 0.0
    for p in pos:
        for q in neg:
            wins += 1.0 if p > q else 0.5 if p == q else 0.0
    return wins / (len(pos) * len(neg))


def fit_logistic(features: List[List[float]], labels: List[int], epochs: int = 1200, lr: float = 0.4) -> List[float]:
    dim = len(features[0]) + 1
    w = [0.0] * dim
    n = len(features)
    for _ in range(epochs):
        grad = [0.0] * dim
        for x, y in zip(features, labels):
            z = w[0] + sum(wi * xi for wi, xi in zip(w[1:], x))
            p = 1 / (1 + math.exp(-max(-30, min(30, z))))
            err = p - y
            grad[0] += err
            for j, xj in enumerate(x):
                grad[j + 1] += err * xj
        for j in range(dim):
            w[j] -= lr * grad[j] / n
    return w


def predict_logistic(w: List[float], x: List[float]) -> float:
    z = w[0] + sum(wi * xi for wi, xi in zip(w[1:], x))
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


def parse_snap_ts(raw: str) -> Optional[int]:
    for fmt in ("%Y-%m-%dT%H", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            continue
    return None


# ---------- data loading ----------

def load_inputs(root: Path):
    out_dir = root / "data" / "flow-study"
    records = [json.loads(l) for l in (out_dir / "wallet_market_records.jsonl").open()]
    wallet_created = json.loads((out_dir / "wallet_created.json").read_text())
    manifest = json.loads((out_dir / "manifest.json").read_text())

    first: Dict[str, Dict[str, Any]] = {}
    spot_series: Dict[str, List[Tuple[int, float]]] = defaultdict(list)
    with (root / "relative-value" / "calibration" / "no_bias_candidates.jsonl").open() as fh:
        for line in fh:
            r = json.loads(line)
            mid = str(r.get("market_id"))
            ts = parse_snap_ts(str(r.get("timestamp", "")))
            if ts and r.get("spot") and r.get("asset"):
                spot_series[r["asset"]].append((ts, float(r["spot"])))
            if mid not in first:
                first[mid] = r
    for asset in spot_series:
        spot_series[asset].sort()
    return out_dir, records, wallet_created, manifest, first, spot_series


def spot_at(series: List[Tuple[int, float]], ts: int) -> Optional[float]:
    best = None
    for t, s in series:
        if t <= ts:
            best = s
        else:
            break
    return best


def trailing_return(series: List[Tuple[int, float]], ts: int, days: float = 7.0) -> Optional[float]:
    """Trailing spot return; accepts a lookback point 2-10 days back, nearest
    to the target, so entries near the start of the log still classify."""
    now = spot_at(series, ts)
    if now is None:
        return None
    target = ts - int(days * 86400)
    best_t, best_s = None, None
    for t, s in series:
        if ts - 10 * 86400 <= t <= ts - 2 * 86400:
            if best_t is None or abs(t - target) < abs(best_t - target):
                best_t, best_s = t, s
    if best_s is None or best_s <= 0:
        return None
    return now / best_s - 1.0


# ---------- walk-forward wallet classification ----------

def classify_wallets(records: List[Dict[str, Any]]):
    """For each market (ordered by end_date) classify each participating wallet
    from strictly earlier-resolving markets only."""
    market_order: List[str] = []
    seen = set()
    for r in records:  # records already sorted by end_date
        if r["market_id"] not in seen:
            seen.add(r["market_id"])
            market_order.append(r["market_id"])

    by_market: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in records:
        by_market[r["market_id"]].append(r)

    prior: Dict[str, Dict[str, float]] = defaultdict(lambda: {"pnl": 0.0, "risk": 0.0, "n": 0.0})
    classification: Dict[str, Dict[str, str]] = {}
    for mid in market_order:
        cls: Dict[str, str] = {}
        for r in by_market[mid]:
            p = prior[r["wallet"]]
            if p["n"] >= MIN_PRIOR_MARKETS and p["risk"] > 0:
                roi = p["pnl"] / p["risk"]
                cls[r["wallet"]] = "smart" if roi >= SMART_ROI else "dumb" if roi <= DUMB_ROI else "mid"
            else:
                cls[r["wallet"]] = "unclassified"
        classification[mid] = cls
        for r in by_market[mid]:
            p = prior[r["wallet"]]
            p["pnl"] += r["pnl"]
            p["risk"] += r["risk"]
            p["n"] += 1
    return market_order, by_market, classification


# ---------- tests ----------

def smart_share_test(market_order, by_market, classification, first):
    per_market = []
    for mid in market_order:
        snap = first.get(mid) or {}
        d = snap.get("direction")
        if d not in ("above", "below"):
            continue
        cls = classification[mid]
        yes_by_class: Dict[str, float] = defaultdict(float)
        stance = {"smart": 0.0, "dumb": 0.0}
        for r in by_market[mid]:
            c = cls[r["wallet"]]
            if r["net_yes"] > 0:
                yes_by_class[c] += r["net_yes"]
            if c in stance:
                stance[c] += r["net_yes"]
        total_yes = sum(yes_by_class.values())
        if total_yes <= 0:
            continue
        per_market.append(
            {
                "market_id": mid,
                "direction": d,
                "y": by_market[mid][0]["y"],
                "smart_share": yes_by_class["smart"] / total_yes,
                "dumb_share": yes_by_class["dumb"] / total_yes,
                "classified_share": (yes_by_class["smart"] + yes_by_class["dumb"] + yes_by_class["mid"]) / total_yes,
                "smart_net_yes": stance["smart"],
                "dumb_net_yes": stance["dumb"],
            }
        )

    dips = [m for m in per_market if m["direction"] == "below"]
    highs = [m for m in per_market if m["direction"] == "above"]
    res = {
        "n_dips": len(dips),
        "n_highs": len(highs),
        "smart_share_dips": mean([m["smart_share"] for m in dips]),
        "smart_share_highs": mean([m["smart_share"] for m in highs]),
        "smart_share_diff": bootstrap_diff([m["smart_share"] for m in dips], [m["smart_share"] for m in highs]),
        "dumb_share_dips": mean([m["dumb_share"] for m in dips]),
        "dumb_share_highs": mean([m["dumb_share"] for m in highs]),
        "dumb_share_diff": bootstrap_diff([m["dumb_share"] for m in dips], [m["dumb_share"] for m in highs]),
        "mean_classified_share": mean([m["classified_share"] for m in per_market]),
    }

    # Does the smart cohort's net YES stance agree with resolution?
    for label in ("smart", "dumb"):
        key = f"{label}_net_yes"
        agree = [(1 if (m[key] > 0) == (m["y"] == 1) else 0) for m in per_market if abs(m[key]) > 1.0]
        k, n = sum(agree), len(agree)
        p, lo, hi = wilson(k, n)
        res[f"{label}_stance_agree"] = {"k": k, "n": n, "rate": p, "lo": lo, "hi": hi}
    return res, per_market


def predictive_lift_test(market_order, by_market, classification, first, out_dir):
    """Expanding-window logistic: PM price vs price + smart/dumb flow measured
    from trades at or before the first calibration snapshot."""
    tapes_dir = out_dir / "tapes"
    rows = []
    for mid in market_order:
        snap = first.get(mid) or {}
        if snap.get("direction") not in ("above", "below"):
            continue
        pm0 = snap.get("pm_yes_price")
        entry_ts = parse_snap_ts(str(snap.get("timestamp", "")))
        if pm0 is None or entry_ts is None:
            continue
        cls = classification[mid]
        net = {"smart": 0.0, "dumb": 0.0}
        gross = 0.0
        with (tapes_dir / f"{mid}.jsonl").open() as fh:
            for line in fh:
                t = json.loads(line)
                ts = t.get("timestamp") or 0
                if ts > entry_ts:
                    continue
                w, oi, side = t.get("proxyWallet"), t.get("outcomeIndex"), t.get("side")
                size = float(t.get("size") or 0)
                if oi not in (0, 1) or side not in ("BUY", "SELL") or size <= 0:
                    continue
                sign = 1.0 if ((side == "BUY") == (oi == 0)) else -1.0
                gross += size
                c = cls.get(w)
                if c in net:
                    net[c] += sign * size
        flow = (net["smart"] - net["dumb"]) / gross if gross > 0 else 0.0
        rows.append({"market_id": mid, "pm0": float(pm0), "flow": flow, "y": by_market[mid][0]["y"]})

    min_train = 60
    preds_price, preds_flow, labels = [], [], []
    for i in range(min_train, len(rows)):
        train, test = rows[:i], rows[i]
        w1 = fit_logistic([[r["pm0"]] for r in train], [r["y"] for r in train])
        w2 = fit_logistic([[r["pm0"], r["flow"]] for r in train], [r["y"] for r in train])
        preds_price.append(predict_logistic(w1, [test["pm0"]]))
        preds_flow.append(predict_logistic(w2, [test["pm0"], test["flow"]]))
        labels.append(test["y"])

    def logloss(ps, ys):
        return -mean([y * math.log(max(p, 1e-9)) + (1 - y) * math.log(max(1 - p, 1e-9)) for p, y in zip(ps, ys)])

    return {
        "n_rows": len(rows),
        "n_scored": len(labels),
        "auc_price_only": auc(preds_price, labels),
        "auc_price_plus_flow": auc(preds_flow, labels),
        "logloss_price_only": logloss(preds_price, labels) if labels else None,
        "logloss_price_plus_flow": logloss(preds_flow, labels) if labels else None,
        "flow_nonzero_share": mean([1.0 if abs(r["flow"]) > 1e-9 else 0.0 for r in rows]),
    }


def size_and_freshness_tests(manifest, first, wallet_created, out_dir):
    tapes_dir = out_dir / "tapes"
    usd: Dict[str, List[float]] = {"above": [], "below": []}
    ages: Dict[str, List[float]] = {"above": [], "below": []}
    counts: Dict[str, List[float]] = {"above": [], "below": []}
    age_cov = {"with_age": 0, "total": 0}

    for mid, m in manifest.items():
        if m.get("status") != "complete":
            continue
        snap = first.get(mid) or {}
        d = snap.get("direction")
        if snap.get("contract_type") != "touch" or d not in ("above", "below"):
            continue
        n_yes_buys = 0
        with (tapes_dir / f"{mid}.jsonl").open() as fh:
            for line in fh:
                t = json.loads(line)
                if t.get("side") != "BUY" or t.get("outcomeIndex") != 0:
                    continue
                price, size = float(t.get("price") or 0), float(t.get("size") or 0)
                if price <= 0 or size <= 0:
                    continue
                usd[d].append(price * size)
                n_yes_buys += 1
                age_cov["total"] += 1
                created = wallet_created.get(t.get("proxyWallet", ""))
                ts = t.get("timestamp")
                if created and ts:
                    age_cov["with_age"] += 1
                    ages[d].append((ts * 1000 - created) / 86400000.0)
        counts[d].append(float(n_yes_buys))

    def dist(xs: List[float]) -> Dict[str, float]:
        return {
            "n": len(xs),
            "median": median(xs),
            "mean": mean(xs),
            "share_le_10": mean([1.0 if x <= 10 else 0.0 for x in xs]),
            "share_le_100": mean([1.0 if x <= 100 else 0.0 for x in xs]),
        }

    return {
        "yes_buy_usd_highs": dist(usd["above"]),
        "yes_buy_usd_dips": dist(usd["below"]),
        "usd_median_diff": bootstrap_diff(usd["below"], usd["above"], stat=median, nboot=1000),
        "yes_buys_per_market_highs": {"n": len(counts["above"]), "median": median(counts["above"])},
        "yes_buys_per_market_dips": {"n": len(counts["below"]), "median": median(counts["below"])},
        "wallet_age_days_highs": dist(ages["above"]),
        "wallet_age_days_dips": dist(ages["below"]),
        "age_median_diff": bootstrap_diff(ages["below"], ages["above"], stat=median, nboot=1000),
        "age_share_lt_7d_highs": mean([1.0 if a < 7 else 0.0 for a in ages["above"]]),
        "age_share_lt_7d_dips": mean([1.0 if a < 7 else 0.0 for a in ages["below"]]),
        "age_coverage": age_cov,
    }


def regime_control_test(per_market_shares, first, spot_series):
    rows = []
    for m in per_market_shares:
        snap = first.get(m["market_id"]) or {}
        ts = parse_snap_ts(str(snap.get("timestamp", "")))
        asset = snap.get("asset")
        if ts is None or not asset:
            continue
        ret = trailing_return(spot_series.get(asset, []), ts)
        if ret is None:
            continue
        rows.append({**m, "trail7": ret, "regime": "down" if ret < 0 else "up"})

    out: Dict[str, Any] = {"n_with_regime": len(rows)}
    for regime in ("down", "up"):
        sub = [r for r in rows if r["regime"] == regime]
        dips = [r for r in sub if r["direction"] == "below"]
        highs = [r for r in sub if r["direction"] == "above"]
        kd, nd = sum(r["y"] for r in dips), len(dips)
        kh, nh = sum(r["y"] for r in highs), len(highs)
        out[regime] = {
            "n_dips": nd,
            "n_highs": nh,
            "dip_hit_rate": (kd / nd) if nd else None,
            "high_hit_rate": (kh / nh) if nh else None,
            "smart_share_dips": mean([r["smart_share"] for r in dips]) if dips else None,
            "smart_share_highs": mean([r["smart_share"] for r in highs]) if highs else None,
        }
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default="/opt/polymarket-trader")
    args = parser.parse_args()
    root = Path(args.repo_root)

    out_dir, records, wallet_created, manifest, first, spot_series = load_inputs(root)
    market_order, by_market, classification = classify_wallets(records)
    print(f"markets={len(market_order)} records={len(records)}")

    results: Dict[str, Any] = {}
    print("\n[1/5] smart-share test...")
    results["smart_share"], per_market_shares = smart_share_test(market_order, by_market, classification, first)
    print(json.dumps(results["smart_share"], indent=1, default=str))

    print("\n[2/5] predictive lift test...")
    results["predictive_lift"] = predictive_lift_test(market_order, by_market, classification, first, out_dir)
    print(json.dumps(results["predictive_lift"], indent=1))

    print("\n[3+4/5] size fingerprint + freshness...")
    results["size_freshness"] = size_and_freshness_tests(manifest, first, wallet_created, out_dir)
    print(json.dumps(results["size_freshness"], indent=1))

    print("\n[5/5] regime control...")
    results["regime_control"] = regime_control_test(per_market_shares, first, spot_series)
    print(json.dumps(results["regime_control"], indent=1))

    res_dir = out_dir / "results"
    res_dir.mkdir(exist_ok=True)
    (res_dir / "informed_flow_results.json").write_text(json.dumps(results, indent=1, default=str))
    with (res_dir / "per_market_shares.jsonl").open("w") as fh:
        for m in per_market_shares:
            fh.write(json.dumps(m) + "\n")
    print(f"\nwrote {res_dir / 'informed_flow_results.json'}")


if __name__ == "__main__":
    main()
