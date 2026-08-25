"""Shared logic for the outcome panel: the unconditioned research substrate.

The panel widens the research sourcing pool from "shadow trades the engine
happened to open" to "every listed Polymarket contract at every archived day,
with known forward returns". One row per (contract, day); outcomes are what
buying YES or NO at the quoted ask would have returned over fixed horizons,
marked at the later bid (full spread paid — conservative).

Terminal inference: when a contract disappears from later snapshots, its
last-seen YES price decides the outcome only if it was already pinned
(>= TERMINAL_YES_PRICE resolves YES, <= TERMINAL_NO_PRICE resolves NO).
Mid-priced disappearances are marked ambiguous and excluded from mining —
dropping them silently would flatter NO sellers, whose losses (early YES
resolutions) are exactly the rows that vanish.
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

PANEL_VERSION = "outcome_panel_v1"
HORIZONS_DAYS = (3, 7)
PREFERRED_HOUR_UTC = 15
# How far past the exact horizon we will look for an exit snapshot before
# falling back to terminal inference.
EXIT_TOLERANCE_DAYS = 2
TERMINAL_YES_PRICE = 0.97
TERMINAL_NO_PRICE = 0.03
# Entry sanity filters (recorded in provenance).
ENTRY_MAX_SPREAD = 0.15
ENTRY_MIN_LIQUIDITY = 500.0
ENTRY_MIN_YES_BID = 0.01
ENTRY_MAX_YES_ASK = 0.99

MACRO_COLUMNS = (
    "macro_composite",
    "macro_coverage",
    "fed_score",
    "iran_score",
    "oil_macro_score",
)

HISTORY_FILE_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})T(\d{2})\d{4}Z-cross_venue_relative_value\.csv$"
)

OUTCOME_CLEAN = "clean"
OUTCOME_TERMINAL_YES = "terminal_yes"
OUTCOME_TERMINAL_NO = "terminal_no"
OUTCOME_AMBIGUOUS = "ambiguous_disappearance"
OUTCOME_MISSING = "missing"

MINEABLE_QUALITIES = {OUTCOME_CLEAN, OUTCOME_TERMINAL_YES, OUTCOME_TERMINAL_NO}


def fnum(value: Any) -> float | None:
    try:
        if value is None:
            return None
        text = str(value).strip().strip('"')
        if text == "" or text.lower() in ("nan", "none", "null"):
            return None
        return float(text)
    except (TypeError, ValueError):
        return None


def discover_history_days(history_dirs: Iterable[Path]) -> dict[date, Path]:
    """Map each day to its snapshot CSV closest to PREFERRED_HOUR_UTC.

    Later directories in `history_dirs` only fill days the earlier ones miss,
    so the state-dir archive (authoritative) should be passed first.
    """
    best: dict[date, tuple[int, Path]] = {}
    for root in history_dirs:
        if not root or not Path(root).is_dir():
            continue
        for day_dir in sorted(Path(root).iterdir()):
            if not day_dir.is_dir():
                continue
            for f in day_dir.iterdir():
                m = HISTORY_FILE_RE.match(f.name)
                if not m:
                    continue
                day = date.fromisoformat(m.group(1))
                distance = abs(int(m.group(2)) - PREFERRED_HOUR_UTC)
                current = best.get(day)
                if current is None or distance < current[0]:
                    best[day] = (distance, f)
    return {day: path for day, (_, path) in sorted(best.items())}


def load_day_rows(path: Path) -> dict[str, dict[str, str]]:
    """Rows keyed by market_id for one snapshot CSV."""
    out: dict[str, dict[str, str]] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            market_id = str(row.get("market_id") or "").strip()
            if market_id:
                out[market_id] = row
    return out


def load_macro_by_day(path: Path) -> dict[str, dict[str, float]]:
    """Latest macro readings per calendar day (rows may be hourly)."""
    out: dict[str, dict[str, float]] = {}
    if not path.is_file():
        return out
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            day = str(row.get("date") or "")[:10]
            if not day:
                continue
            values = {}
            for col in MACRO_COLUMNS:
                v = fnum(row.get(col))
                if v is not None:
                    values[col] = v
            if values:
                out[day] = values  # later rows for the same day overwrite
    return out


def entry_eligible(row: dict[str, str]) -> bool:
    bid = fnum(row.get("pm_best_bid"))
    ask = fnum(row.get("pm_best_ask"))
    if bid is None or ask is None:
        return False
    if not (0.0 < bid <= ask < 1.0):
        return False
    if bid < ENTRY_MIN_YES_BID or ask > ENTRY_MAX_YES_ASK:
        return False
    if (ask - bid) > ENTRY_MAX_SPREAD:
        return False
    liquidity = fnum(row.get("liquidity"))
    if liquidity is None or liquidity < ENTRY_MIN_LIQUIDITY:
        return False
    return True


def _terminal_quality(last_yes_price: float | None) -> str:
    if last_yes_price is None:
        return OUTCOME_AMBIGUOUS
    if last_yes_price >= TERMINAL_YES_PRICE:
        return OUTCOME_TERMINAL_YES
    if last_yes_price <= TERMINAL_NO_PRICE:
        return OUTCOME_TERMINAL_NO
    return OUTCOME_AMBIGUOUS


def compute_outcome(
    entry_row: dict[str, str],
    entry_day: date,
    horizon_days: int,
    day_maps: dict[date, dict[str, dict[str, str]]],
    all_days: list[date],
) -> dict[str, Any]:
    """Forward P&L (in %) for YES and NO entered from `entry_row`.

    Returns {quality, yes_pnl_pct, no_pnl_pct, exit_day}.
    """
    market_id = str(entry_row.get("market_id") or "").strip()
    entry_yes_ask = fnum(entry_row.get("pm_best_ask"))
    entry_yes_bid = fnum(entry_row.get("pm_best_bid"))
    if entry_yes_ask is None or entry_yes_bid is None:
        return {"quality": OUTCOME_MISSING, "yes_pnl_pct": None, "no_pnl_pct": None, "exit_day": None}

    target = entry_day + timedelta(days=horizon_days)

    # Exact horizon day first, then nearby later/earlier days within tolerance.
    # An earlier exit must still be past the midpoint of the horizon — marking
    # a 3-day outcome one day after entry would measure a different claim.
    min_exit_day = entry_day + timedelta(days=max(1, horizon_days // 2 + 1))
    exit_row = None
    exit_day = None
    offsets = [0] + [o for k in range(1, EXIT_TOLERANCE_DAYS + 1) for o in (k, -k)]
    for offset in offsets:
        day = target + timedelta(days=offset)
        if day < min_exit_day:
            continue
        row = day_maps.get(day, {}).get(market_id)
        if row is not None:
            exit_row = row
            exit_day = day
            break

    if exit_row is not None:
        exit_yes_bid = fnum(exit_row.get("pm_best_bid"))
        exit_yes_ask = fnum(exit_row.get("pm_best_ask"))
        if exit_yes_bid is None or exit_yes_ask is None:
            return {"quality": OUTCOME_MISSING, "yes_pnl_pct": None, "no_pnl_pct": None, "exit_day": None}
        quality = OUTCOME_CLEAN
        yes_exit = exit_yes_bid
        no_exit = 1.0 - exit_yes_ask
    else:
        # Contract absent around the horizon: find its last appearance after
        # entry (or fall back to the entry row itself) and infer terminality.
        last_yes_price = None
        last_seen_day = None
        for day in all_days:
            if day <= entry_day or day > target + timedelta(days=EXIT_TOLERANCE_DAYS):
                continue
            row = day_maps.get(day, {}).get(market_id)
            if row is not None:
                price = fnum(row.get("pm_yes_price")) or fnum(row.get("pm_best_bid"))
                if price is not None:
                    last_yes_price = price
                    last_seen_day = day
        if last_yes_price is None:
            last_yes_price = fnum(entry_row.get("pm_yes_price"))
            last_seen_day = entry_day
        quality = _terminal_quality(last_yes_price)
        if quality == OUTCOME_TERMINAL_YES:
            yes_exit, no_exit = 1.0, 0.0
        elif quality == OUTCOME_TERMINAL_NO:
            yes_exit, no_exit = 0.0, 1.0
        else:
            return {
                "quality": OUTCOME_AMBIGUOUS,
                "yes_pnl_pct": None,
                "no_pnl_pct": None,
                "exit_day": last_seen_day.isoformat() if last_seen_day else None,
            }
        exit_day = last_seen_day

    entry_no_ask = 1.0 - entry_yes_bid
    yes_pnl_pct = (yes_exit - entry_yes_ask) / entry_yes_ask * 100.0 if entry_yes_ask > 0 else None
    no_pnl_pct = (no_exit - entry_no_ask) / entry_no_ask * 100.0 if entry_no_ask > 0 else None
    return {
        "quality": quality,
        "yes_pnl_pct": round(yes_pnl_pct, 4) if yes_pnl_pct is not None else None,
        "no_pnl_pct": round(no_pnl_pct, 4) if no_pnl_pct is not None else None,
        "exit_day": exit_day.isoformat() if exit_day else None,
    }


PANEL_FEATURE_COLUMNS = (
    "direction",
    "strike",
    "spot",
    "dte_days",
    "yes_ask",
    "yes_bid",
    "pm_spread",
    "liquidity",
    "volume",
    "sell_yes_edge_pts",
    "buy_yes_edge_pts",
    "adjusted_no_gap_pts",
    "pm_iv",
    "option_iv",
    "pm_iv_minus_opt_iv_pts",
    "edge_pts_per_dte",
    "pm_to_underlying_cap_ratio",
    "settlement_overround",
    "settlement_skew_yes",
    "source_agreement_bucket",
    "smart_flow_net_yes",
    "smart_flow_stance",
    "perp_funding_ann",
    "perp_basis_pct",
    "moneyness_pct",
    "day_of_week",
    "is_weekend",
    "btc_funding_ann",
    "spot_ret_24h_pct",
) + MACRO_COLUMNS


def panel_header() -> list[str]:
    cols = ["entry_date", "asset", "market_id", "event_slug"]
    cols.extend(PANEL_FEATURE_COLUMNS)
    for h in HORIZONS_DAYS:
        cols.extend(
            [
                f"yes_pnl_pct_{h}d",
                f"no_pnl_pct_{h}d",
                f"outcome_quality_{h}d",
                f"exit_day_{h}d",
            ]
        )
    return cols


def build_panel_row(
    entry_row: dict[str, str],
    entry_day: date,
    day_maps: dict[date, dict[str, dict[str, str]]],
    all_days: list[date],
    macro_by_day: dict[str, dict[str, float]],
    prev_day_rows: dict[str, dict[str, str]] | None,
) -> dict[str, Any]:
    asset = str(entry_row.get("asset") or "").upper()
    strike = fnum(entry_row.get("strike"))
    spot = fnum(entry_row.get("spot"))
    pm_iv = fnum(entry_row.get("pm_iv"))
    option_iv = fnum(entry_row.get("option_iv"))
    yes_ask = fnum(entry_row.get("pm_best_ask"))
    yes_bid = fnum(entry_row.get("pm_best_bid"))

    moneyness_pct = None
    if strike is not None and spot is not None and spot > 0:
        moneyness_pct = round((strike / spot - 1.0) * 100.0, 4)

    iv_gap_pts = None
    if pm_iv is not None and option_iv is not None:
        iv_gap_pts = round((pm_iv - option_iv) * 100.0, 4)

    spot_ret_24h_pct = None
    if prev_day_rows is not None and spot is not None:
        market_id = str(entry_row.get("market_id") or "").strip()
        prev = prev_day_rows.get(market_id)
        if prev is None:
            # Any contract of the same asset carries the same spot.
            prev = next(
                (r for r in prev_day_rows.values() if str(r.get("asset") or "").upper() == asset),
                None,
            )
        prev_spot = fnum(prev.get("spot")) if prev else None
        if prev_spot is not None and prev_spot > 0:
            spot_ret_24h_pct = round((spot / prev_spot - 1.0) * 100.0, 4)

    btc_funding = None
    day_rows = day_maps.get(entry_day, {})
    for r in day_rows.values():
        if str(r.get("asset") or "").upper() == "BTC":
            btc_funding = fnum(r.get("perp_funding_ann"))
            if btc_funding is not None:
                break

    weekday = entry_day.weekday()  # 0=Mon
    macro = macro_by_day.get(entry_day.isoformat(), {})

    out: dict[str, Any] = {
        "entry_date": entry_day.isoformat(),
        "asset": asset,
        "market_id": str(entry_row.get("market_id") or "").strip(),
        "event_slug": str(entry_row.get("event_slug") or ""),
        "direction": str(entry_row.get("direction") or ""),
        "strike": strike,
        "spot": spot,
        "dte_days": fnum(entry_row.get("dte_days")),
        "yes_ask": yes_ask,
        "yes_bid": yes_bid,
        "pm_spread": fnum(entry_row.get("pm_spread")),
        "liquidity": fnum(entry_row.get("liquidity")),
        "volume": fnum(entry_row.get("volume")),
        "sell_yes_edge_pts": fnum(entry_row.get("sell_yes_edge_pts")),
        "buy_yes_edge_pts": fnum(entry_row.get("buy_yes_edge_pts")),
        "adjusted_no_gap_pts": fnum(entry_row.get("adjusted_no_gap_pts")),
        "pm_iv": pm_iv,
        "option_iv": option_iv,
        "pm_iv_minus_opt_iv_pts": iv_gap_pts,
        "edge_pts_per_dte": fnum(entry_row.get("edge_pts_per_dte")),
        "pm_to_underlying_cap_ratio": fnum(entry_row.get("pm_to_underlying_cap_ratio")),
        "settlement_overround": fnum(entry_row.get("settlement_overround")),
        "settlement_skew_yes": fnum(entry_row.get("settlement_skew_yes")),
        "source_agreement_bucket": str(entry_row.get("source_agreement_bucket") or ""),
        "smart_flow_net_yes": fnum(entry_row.get("smart_flow_net_yes")),
        "smart_flow_stance": fnum(entry_row.get("smart_flow_stance")),
        "perp_funding_ann": fnum(entry_row.get("perp_funding_ann")),
        "perp_basis_pct": fnum(entry_row.get("perp_basis_pct")),
        "moneyness_pct": moneyness_pct,
        "day_of_week": weekday,
        "is_weekend": 1 if weekday >= 5 else 0,
        "btc_funding_ann": btc_funding,
        "spot_ret_24h_pct": spot_ret_24h_pct,
    }
    for col in MACRO_COLUMNS:
        out[col] = macro.get(col)

    for h in HORIZONS_DAYS:
        oc = compute_outcome(entry_row, entry_day, h, day_maps, all_days)
        out[f"yes_pnl_pct_{h}d"] = oc["yes_pnl_pct"]
        out[f"no_pnl_pct_{h}d"] = oc["no_pnl_pct"]
        out[f"outcome_quality_{h}d"] = oc["quality"]
        out[f"exit_day_{h}d"] = oc["exit_day"]
    return out


# ---------------------------------------------------------------------------
# Feature bucketing for the miner. Each feature maps a panel row to a stable
# bucket label, and declares how the bucket translates into engine-evaluable
# hypothesis conditions (catalog keys). Features without a catalog key are
# still mined — their findings are flagged catalogCovered=false and surfaced
# as coverage gaps instead of LLM-authorable opportunities.
# ---------------------------------------------------------------------------

def _bucket_numeric(value: float | None, edges: list[float], labels: list[str]) -> str | None:
    if value is None:
        return None
    for edge, label in zip(edges, labels):
        if value < edge:
            return label
    return labels[-1]


class PanelFeature:
    def __init__(
        self,
        name: str,
        column: str,
        bucketer,
        catalog_key: str | None,
        condition_for_bucket=None,
    ) -> None:
        self.name = name
        self.column = column
        self.bucketer = bucketer
        self.catalog_key = catalog_key
        # bucket label -> conditions dict fragment ({key: expression})
        self.condition_for_bucket = condition_for_bucket or (lambda bucket: None)

    def bucket(self, row: dict[str, Any]) -> str | None:
        return self.bucketer(row.get(self.column))


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else str(x)


def _range_condition(key: str, low: float | None, high: float | None) -> dict[str, Any]:
    """Render a [low, high) bucket in the engine's own expression grammar
    (see satisfiesNumericExpression in hypothesis-shadow-eval.ts), so the LLM
    can copy conditions verbatim into an evaluable hypothesis."""
    if low is not None and high is not None:
        return {key: f"between {_fmt(low)} and {_fmt(high)}"}
    if low is not None:
        return {key: f">= {_fmt(low)}"}
    if high is not None:
        return {key: f"< {_fmt(high)}"}
    return {key: ""}


def _make_numeric_feature(
    name: str,
    column: str,
    edges: list[float],
    labels: list[str],
    catalog_key: str | None,
) -> PanelFeature:
    bounds: dict[str, tuple[float | None, float | None]] = {}
    lows = [None] + list(edges)
    highs = list(edges) + [None]
    for label, low, high in zip(labels, lows, highs):
        bounds[label] = (low, high)

    def condition(bucket: str):
        if catalog_key is None or bucket not in bounds:
            return None
        low, high = bounds[bucket]
        return _range_condition(catalog_key, low, high)

    return PanelFeature(
        name,
        column,
        lambda v: _bucket_numeric(fnum(v), edges, labels),
        catalog_key,
        condition,
    )


def _direction_bucket(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    if text in ("above", "below"):
        return f"dir={text}"
    return None


def _stance_bucket(value: Any) -> str:
    v = fnum(value)
    if v is None:
        return "s?"
    if v < 0:
        return "s-1"
    if v > 0:
        return "s+1"
    return "s0"


def _weekend_bucket(value: Any) -> str | None:
    v = fnum(value)
    if v is None:
        return None
    return "weekend" if v >= 1 else "weekday"


def panel_features() -> list[PanelFeature]:
    features = [
        PanelFeature(
            "dir",
            "direction",
            _direction_bucket,
            "touch_direction",
            # Catalog encodes direction numerically: above=+1, below=-1.
            lambda b: {"touch_direction": ">= 1"} if b == "dir=above"
            else ({"touch_direction": "<= -1"} if b == "dir=below" else None),
        ),
        _make_numeric_feature(
            "edge", "sell_yes_edge_pts", [1.0, 3.0, 8.0], ["e<1", "e1-3", "e3-8", "e8+"],
            "sell_yes_edge_pts",
        ),
        _make_numeric_feature(
            "dte", "dte_days", [30.0, 90.0], ["d<30", "d30-90", "d90+"], "days_to_expiry",
        ),
        _make_numeric_feature(
            "price", "yes_ask", [0.10, 0.35, 0.65, 0.90],
            ["p<10", "p10-35", "p35-65", "p65-90", "p90+"], "yesAsk",
        ),
        _make_numeric_feature(
            "spread", "pm_spread", [0.02, 0.05], ["sp<2", "sp2-5", "sp5+"], "yesSpread",
        ),
        _make_numeric_feature(
            "liq", "liquidity", [5000.0, 25000.0], ["L<5k", "L5-25k", "L25k+"], "liquidity",
        ),
        PanelFeature("stance", "smart_flow_stance", _stance_bucket, "smart_flow_stance",
                     _stance_condition),
        _make_numeric_feature(
            "ivgap", "pm_iv_minus_opt_iv_pts", [0.0, 10.0], ["ivg<0", "ivg0-10", "ivg10+"],
            "pm_iv_minus_opt_iv_pts",
        ),
        _make_numeric_feature(
            "nogap", "adjusted_no_gap_pts", [0.0, 5.0], ["ng<0", "ng0-5", "ng5+"],
            "adjusted_no_gap_pts",
        ),
        PanelFeature("dow", "is_weekend", _weekend_bucket, "day_of_week", _dow_condition),
        # --- Panel-only features (no catalog key yet): mined, reported as
        # coverage gaps rather than authorable opportunities. ---
        _make_numeric_feature(
            "fund", "perp_funding_ann", [-0.10, 0.0, 0.20], ["f<-10", "f-10-0", "f0-20", "f20+"],
            None,
        ),
        _make_numeric_feature(
            "money", "moneyness_pct", [-10.0, 0.0, 10.0, 50.0],
            ["m<-10", "m-10-0", "m0-10", "m10-50", "m50+"], None,
        ),
        _make_numeric_feature(
            "macro", "macro_composite", [-0.25, 0.25], ["mac<0", "mac~0", "mac>0"], None,
        ),
        _make_numeric_feature(
            "spotret", "spot_ret_24h_pct", [-2.0, 2.0], ["r<-2", "r-2-2", "r2+"], None,
        ),
    ]
    return features


def _stance_condition(bucket: str):
    mapping = {"s-1": "<= -1", "s+1": ">= 1", "s0": "= 0"}
    expr = mapping.get(bucket)
    return {"smart_flow_stance": expr} if expr else None


def _dow_condition(bucket: str):
    if bucket == "weekend":
        return {"day_of_week": "in [sat, sun]"}
    if bucket == "weekday":
        return {"day_of_week": "in [mon, tue, wed, thu, fri]"}
    return None


# Single features are mined for every feature; pairs are curated to keep the
# test family from exploding combinatorially (BH still adjusts across all).
PANEL_PAIR_STRATIFICATIONS: tuple[tuple[str, str], ...] = (
    ("dir", "edge"),
    ("dir", "dte"),
    ("dir", "price"),
    ("dir", "stance"),
    ("dir", "ivgap"),
    ("dir", "fund"),
    ("dir", "dow"),
    ("edge", "dte"),
    ("edge", "price"),
    ("price", "dte"),
    ("price", "liq"),
    ("price", "spread"),
    ("fund", "dow"),
    ("macro", "dir"),
)

# Triple stratifications localize the established YES-overpricing edge (the
# one live trading, the shadow cohort, and the pooled panel all agree on).
# Raw panel cuts show the edge concentrates sharply by expiry — mid-priced
# NOs run 66-85% wins under 30 DTE and fade to coin-flip beyond 90 — so the
# miner needs cells fine enough to emit those as formal, holdout-confirmed
# FINDs. Kept to a curated trio: every triple multiplies the BH test family.
PANEL_TRIPLE_STRATIFICATIONS: tuple[tuple[str, str, str], ...] = (
    ("edge", "price", "dte"),
    ("dir", "price", "dte"),
    ("price", "dte", "liq"),
)


def dedupe_non_overlapping(
    rows: list[dict[str, Any]], horizon_days: int
) -> list[dict[str, Any]]:
    """Keep at most one row per contract per horizon window.

    Adjacent daily rows for the same contract share most of their forward
    window; counting them all would overstate n. Greedy selection by date
    with spacing >= horizon gives (approximately) independent samples.
    """
    by_contract: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_contract[str(row.get("market_id"))].append(row)
    kept: list[dict[str, Any]] = []
    for contract_rows in by_contract.values():
        contract_rows.sort(key=lambda r: str(r.get("entry_date")))
        last: date | None = None
        for row in contract_rows:
            try:
                day = date.fromisoformat(str(row.get("entry_date")))
            except ValueError:
                continue
            if last is None or (day - last).days >= horizon_days:
                kept.append(row)
                last = day
    kept.sort(key=lambda r: (str(r.get("entry_date")), str(r.get("market_id"))))
    return kept
