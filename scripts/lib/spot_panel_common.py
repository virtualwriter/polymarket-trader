"""Shared logic for the spot/perp outcome panel.

The contract outcome panel (panel_common.py) gave Polymarket theses
panel-grade evidence: every archived contract-day with known forward returns.
Non-Polymarket ideas still had to earn everything through forward shadow
tests. This module is the symmetric substrate: one row per (asset, day) from
the daily-valuations history, labeled with forward spot returns at fixed
horizons, joined with the funding / positioning / momentum / macro features
the system knew at entry time.

Design decisions that avoid the contract panel's first-night failures:

  * THE EXAM IS THE MEASUREMENT. The engine grades a spot test as
    movePct >= threshold (long) or <= -threshold (short), threshold parsed
    from "> X%" in the prediction (default 2). The miner therefore counts
    wins at a per-horizon exam threshold (SPOT_EXAM_THRESHOLD_PCT) and every
    FIND records that threshold so the LLM writes it into the prediction
    verbatim. Mining "any positive move" would grade candidates on an exam
    no live test will ever sit.
  * STALE PRICES ARE EXCLUDED, NOT COUNTED. Stocks, gold and oil do not
    tick on weekends; the valuation history repeats the last close. Entries
    on stale days are skipped and forward windows in which the price never
    moves are marked "stale" and never mined — counting them would flood
    short-side cells with fake 0% "losses" and long cells with fake losses
    at any threshold.
  * NO LOOK-AHEAD. Trailing features (z-scores, percentiles, SMAs, highs)
    are computed strictly from samples at or before the entry day. Base
    rates come from the discovery split only; the most recent ~30% of days
    are a temporal holdout the miner never conditions on.
  * ONLY SCORABLE ASSETS. The universe is exactly the assets the engine's
    spot scorer can price (getAssetPrice in hypothesis-shadow-eval.ts), so
    every FIND can become a hypothesis whose tests actually grade.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Callable

from lib.panel_common import MACRO_COLUMNS, fnum

SPOT_PANEL_VERSION = "spot_panel_v1"
SPOT_HORIZONS_DAYS = (1, 3, 7)
SPOT_PREFERRED_HOUR_UTC = 15

# The exam: engine's scoreDirectionalMove grades a win as a move of at least
# this many percent in the predicted direction over the timeframe. Keep in
# lockstep with SPOT_EXAM_THRESHOLD_PCT in research-queries.ts.
SPOT_EXAM_THRESHOLD_PCT: dict[int, float] = {1: 0.5, 3: 1.0, 7: 2.0}

SPOT_OUTCOME_CLEAN = "clean"
SPOT_OUTCOME_STALE = "stale"
SPOT_OUTCOME_MISSING = "missing"
SPOT_MINEABLE_QUALITIES = {SPOT_OUTCOME_CLEAN}

# Universe: assets getAssetPrice can price, with their valuation columns.
# "pc" = put/call ratio column, "iv30"/"iv90" = listed option IVs,
# "ivts_col" = a real term-spread valuation column (conditions can only
# reference real columns, so computed 30-90 spreads are panel-only features).
SPOT_ASSETS: dict[str, dict[str, str]] = {
    "BTC": {
        "price": "btc_spot",
        "funding": "btc_hl_funding_ann",
        "pc": "btc_ibit_pc_ratio",
        "iv30": "btc_opt_iv_30d",
        "iv90": "btc_opt_iv_90d",
        "ivts_col": "btc_opt_iv_term_spread",
    },
    "ETH": {"price": "eth_spot", "funding": "eth_hl_funding_ann"},
    "SOL": {"price": "sol_spot", "funding": "sol_hl_funding_ann"},
    "HYPE": {"price": "hype_spot", "funding": "hype_hl_funding_ann"},
    "GOLD": {
        "price": "gold_gc_spot",
        "funding": "gold_hl_funding_ann",
        "pc": "gold_gld_pc_ratio",
        "iv30": "gold_opt_iv_30d",
        "iv90": "gold_opt_iv_90d",
    },
    "SILVER": {"price": "silver_spot", "funding": "silver_hl_funding_ann"},
    "OIL": {
        "price": "oil_wti_spot",
        "funding": "oil_hl_funding_ann",
        "pc": "oil_cl_pc_ratio",
        "iv30": "oil_opt_iv_30d",
        "iv90": "oil_opt_iv_90d",
    },
    "AMZN": {
        "price": "amzn_stock",
        "funding": "amzn_hl_funding_ann",
        "pc": "amzn_pc_ratio",
        "iv30": "amzn_opt_iv_30d",
        "iv90": "amzn_opt_iv_90d",
    },
    "SPY": {"price": "spy_spot"},
}


def parse_valuation_day(raw: Any) -> tuple[date, int] | None:
    """('2026-04-03T23' | '2026-04-03') -> (date, hour). Bare dates read as
    hour 12 so they neither win nor badly lose the closest-to-15UTC contest."""
    text = str(raw or "").strip().strip('"')
    if len(text) < 10:
        return None
    try:
        day = date.fromisoformat(text[:10])
    except ValueError:
        return None
    hour = 12
    if len(text) >= 13 and text[10] == "T":
        try:
            hour = int(text[11:13])
        except ValueError:
            hour = 12
    return day, hour


def sample_daily_rows(valuation_rows: list[dict[str, str]]) -> dict[date, dict[str, str]]:
    """One valuation row per day, the one closest to SPOT_PREFERRED_HOUR_UTC."""
    best: dict[date, tuple[int, dict[str, str]]] = {}
    for row in valuation_rows:
        parsed = parse_valuation_day(row.get("date"))
        if parsed is None:
            continue
        day, hour = parsed
        distance = abs(hour - SPOT_PREFERRED_HOUR_UTC)
        current = best.get(day)
        if current is None or distance < current[0]:
            best[day] = (distance, row)
    return {day: row for day, (_, row) in sorted(best.items())}


# ---------------------------------------------------------------------------
# Trailing per-asset series stats (no look-ahead: windows end at the entry day)
# ---------------------------------------------------------------------------

class TrailingSeries:
    """Per-column daily series with trailing-window stats as of a given day."""

    def __init__(self, samples: dict[date, dict[str, str]], column: str) -> None:
        self.points: list[tuple[date, float]] = []
        for day, row in sorted(samples.items()):
            v = fnum(row.get(column))
            if v is not None:
                self.points.append((day, v))

    def value_on(self, day: date) -> float | None:
        for d, v in self.points:
            if d == day:
                return v
        return None

    def window(self, day: date, window_days: int) -> list[float]:
        start = day - timedelta(days=window_days)
        return [v for d, v in self.points if start <= d <= day]

    def prev_value(self, day: date, max_gap_days: int = 2) -> float | None:
        candidates = [(d, v) for d, v in self.points if d < day and (day - d).days <= max_gap_days]
        return candidates[-1][1] if candidates else None

    def change_pct_24h(self, day: date) -> float | None:
        v = self.value_on(day)
        prev = self.prev_value(day)
        if v is None or prev is None or prev <= 0:
            return None
        return round((v / prev - 1.0) * 100.0, 4)

    def pct_from_high(self, day: date, window_days: int, min_samples: int = 4) -> float | None:
        v = self.value_on(day)
        values = self.window(day, window_days)
        if v is None or len(values) < min_samples:
            return None
        high = max(values)
        if high <= 0:
            return None
        return round((v / high - 1.0) * 100.0, 4)

    def pct_vs_sma(self, day: date, window_days: int, min_samples: int = 10) -> float | None:
        v = self.value_on(day)
        values = self.window(day, window_days)
        if v is None or len(values) < min_samples:
            return None
        sma = sum(values) / len(values)
        if sma <= 0:
            return None
        return round((v / sma - 1.0) * 100.0, 4)

    def percentile(self, day: date, window_days: int, min_samples: int = 10) -> float | None:
        v = self.value_on(day)
        values = self.window(day, window_days)
        if v is None or len(values) < min_samples:
            return None
        below = sum(1 for x in values if x < v)
        equal = sum(1 for x in values if x == v)
        return round((below + 0.5 * equal) / len(values) * 100.0, 2)

    def zscore(self, day: date, window_days: int, min_samples: int = 10) -> float | None:
        v = self.value_on(day)
        values = self.window(day, window_days)
        if v is None or len(values) < min_samples:
            return None
        mean = sum(values) / len(values)
        std = statistics.pstdev(values)
        if std <= 0:
            return None
        return round((v - mean) / std, 4)

    def realized_vol_pct(self, day: date, window_days: int, min_samples: int = 10) -> float | None:
        start = day - timedelta(days=window_days)
        pts = [(d, v) for d, v in self.points if start <= d <= day]
        rets = []
        for (d0, v0), (d1, v1) in zip(pts, pts[1:]):
            if v0 > 0 and (d1 - d0).days <= 3 and v1 != v0:
                rets.append((v1 / v0 - 1.0) * 100.0)
        if len(rets) < min_samples:
            return None
        return round(statistics.pstdev(rets), 4)


# ---------------------------------------------------------------------------
# Forward outcomes
# ---------------------------------------------------------------------------

def spot_exit_tolerance_days(horizon_days: int) -> int:
    """A 1d claim may only exit on the exact next day; longer horizons get
    slack, never past the window midpoint (a 3d outcome marked 1 day after
    entry would measure a different claim)."""
    return min(2, horizon_days // 2)


def compute_spot_outcome(
    series: TrailingSeries,
    entry_day: date,
    horizon_days: int,
) -> dict[str, Any]:
    """Forward move (%) of the asset from entry_day over horizon_days.

    Returns {quality, move_pct, exit_day}. move_pct is the LONG view; the
    short side is its negation. quality "stale" flags windows in which the
    price never moved (closed market / frozen feed) — excluded from mining.
    """
    entry_px = series.value_on(entry_day)
    if entry_px is None or entry_px <= 0:
        return {"quality": SPOT_OUTCOME_MISSING, "move_pct": None, "exit_day": None}

    target = entry_day + timedelta(days=horizon_days)
    tolerance = spot_exit_tolerance_days(horizon_days)
    min_exit_day = entry_day + timedelta(days=max(1, horizon_days // 2 + 1))

    exit_px = None
    exit_day = None
    offsets = [0] + [o for k in range(1, tolerance + 1) for o in (k, -k)]
    for offset in offsets:
        day = target + timedelta(days=offset)
        if day < min_exit_day:
            continue
        px = series.value_on(day)
        if px is not None and px > 0:
            exit_px = px
            exit_day = day
            break
    if exit_px is None or exit_day is None:
        return {"quality": SPOT_OUTCOME_MISSING, "move_pct": None, "exit_day": None}

    window_values = [
        v for d, v in series.points if entry_day <= d <= exit_day
    ]
    if len(set(window_values)) <= 1:
        return {
            "quality": SPOT_OUTCOME_STALE,
            "move_pct": 0.0,
            "exit_day": exit_day.isoformat(),
        }

    move_pct = round((exit_px / entry_px - 1.0) * 100.0, 4)
    return {
        "quality": SPOT_OUTCOME_CLEAN,
        "move_pct": move_pct,
        "exit_day": exit_day.isoformat(),
    }


# ---------------------------------------------------------------------------
# Panel schema
# ---------------------------------------------------------------------------

SPOT_FEATURE_COLUMNS = (
    "price",
    "fund_ann",
    "fund_z30",
    "ret_24h_pct",
    "pct_from_7d_high",
    "pct_vs_30d_sma",
    "pc_ratio",
    "pc_pctile_30d",
    "iv_term_spread_pts",
    "realized_vol_30d_pct",
    "day_of_week",
    "is_weekend",
) + MACRO_COLUMNS


def spot_panel_header() -> list[str]:
    cols = ["entry_date", "asset"]
    cols.extend(SPOT_FEATURE_COLUMNS)
    for h in SPOT_HORIZONS_DAYS:
        cols.extend([f"move_pct_{h}d", f"outcome_quality_{h}d", f"exit_day_{h}d"])
    return cols


def build_spot_panel_row(
    asset: str,
    entry_day: date,
    price_series: TrailingSeries,
    fund_series: TrailingSeries | None,
    pc_series: TrailingSeries | None,
    iv30_series: TrailingSeries | None,
    iv90_series: TrailingSeries | None,
    macro_by_day: dict[str, dict[str, float]],
) -> dict[str, Any]:
    weekday = entry_day.weekday()  # 0=Mon
    macro = macro_by_day.get(entry_day.isoformat(), {})

    iv_term_spread = None
    if iv30_series is not None and iv90_series is not None:
        iv30 = iv30_series.value_on(entry_day)
        iv90 = iv90_series.value_on(entry_day)
        if iv30 is not None and iv90 is not None:
            iv_term_spread = round(iv30 - iv90, 4)

    out: dict[str, Any] = {
        "entry_date": entry_day.isoformat(),
        "asset": asset,
        "price": price_series.value_on(entry_day),
        "fund_ann": fund_series.value_on(entry_day) if fund_series else None,
        "fund_z30": fund_series.zscore(entry_day, 30) if fund_series else None,
        "ret_24h_pct": price_series.change_pct_24h(entry_day),
        "pct_from_7d_high": price_series.pct_from_high(entry_day, 7),
        "pct_vs_30d_sma": price_series.pct_vs_sma(entry_day, 30),
        "pc_ratio": pc_series.value_on(entry_day) if pc_series else None,
        "pc_pctile_30d": pc_series.percentile(entry_day, 30) if pc_series else None,
        "iv_term_spread_pts": iv_term_spread,
        "realized_vol_30d_pct": price_series.realized_vol_pct(entry_day, 30),
        "day_of_week": weekday,
        "is_weekend": 1 if weekday >= 5 else 0,
    }
    for col in MACRO_COLUMNS:
        out[col] = macro.get(col)

    for h in SPOT_HORIZONS_DAYS:
        oc = compute_spot_outcome(price_series, entry_day, h)
        out[f"move_pct_{h}d"] = oc["move_pct"]
        out[f"outcome_quality_{h}d"] = oc["quality"]
        out[f"exit_day_{h}d"] = oc["exit_day"]
    return out


def entry_is_stale(price_series: TrailingSeries, entry_day: date) -> bool:
    """A day whose price exactly equals the previous sample is a closed
    market (stocks/gold on weekends) — the quote is not tradeable then."""
    v = price_series.value_on(entry_day)
    prev = price_series.prev_value(entry_day)
    return v is not None and prev is not None and v == prev


# ---------------------------------------------------------------------------
# Feature bucketing for the miner. Conditions render into per-asset catalog
# keys (derived time-series patterns over real valuation columns), so a FIND's
# suggestedConditions paste verbatim into an evaluable hypothesis. Features
# without a catalog mapping are still mined and surfaced as coverage gaps.
# ---------------------------------------------------------------------------

def _bucket_numeric(value: float | None, edges: list[float], labels: list[str]) -> str | None:
    if value is None:
        return None
    for edge, label in zip(edges, labels):
        if value < edge:
            return label
    return labels[-1]


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else str(x)


def _range_expression(low: float | None, high: float | None) -> str:
    if low is not None and high is not None:
        return "between %s and %s" % (_fmt(low), _fmt(high))
    if low is not None:
        return ">= %s" % _fmt(low)
    return "< %s" % _fmt(high if high is not None else 0.0)


class SpotFeature:
    """A panel column bucketed for stratification, with a per-asset mapping
    into an engine-evaluable condition key (or None = panel-only)."""

    def __init__(
        self,
        name: str,
        column: str,
        edges: list[float],
        labels: list[str],
        key_for_asset: Callable[[str], str | None],
    ) -> None:
        self.name = name
        self.column = column
        self.edges = edges
        self.labels = labels
        self.key_for_asset = key_for_asset
        bounds: dict[str, tuple[float | None, float | None]] = {}
        lows: list[float | None] = [None] + list(edges)
        highs: list[float | None] = list(edges) + [None]
        for label, low, high in zip(labels, lows, highs):
            bounds[label] = (low, high)
        self._bounds = bounds

    def bucket(self, row: dict[str, Any]) -> str | None:
        return _bucket_numeric(fnum(row.get(self.column)), self.edges, self.labels)

    def condition_for(self, asset: str, bucket: str) -> dict[str, Any] | None:
        key = self.key_for_asset(asset)
        if key is None or bucket not in self._bounds:
            return None
        low, high = self._bounds[bucket]
        return {key: _range_expression(low, high)}


class SpotDowFeature:
    """Weekend/weekday split, mapped to the day_of_week metadata key."""

    name = "dow"
    column = "is_weekend"

    def bucket(self, row: dict[str, Any]) -> str | None:
        v = fnum(row.get(self.column))
        if v is None:
            return None
        return "weekend" if v >= 1 else "weekday"

    def condition_for(self, asset: str, bucket: str) -> dict[str, Any] | None:
        if bucket == "weekend":
            return {"day_of_week": "in [sat, sun]"}
        if bucket == "weekday":
            return {"day_of_week": "in [mon, tue, wed, thu, fri]"}
        return None


def _asset_col(field: str) -> Callable[[str], str | None]:
    def resolve(asset: str) -> str | None:
        return SPOT_ASSETS.get(asset, {}).get(field)
    return resolve


def _derived_key(field: str, suffix: str) -> Callable[[str], str | None]:
    def resolve(asset: str) -> str | None:
        base = SPOT_ASSETS.get(asset, {}).get(field)
        return f"{base}_{suffix}" if base else None
    return resolve


def _no_key(_asset: str) -> str | None:
    return None


def spot_panel_features() -> list[Any]:
    return [
        SpotFeature(
            "fund", "fund_ann", [-20.0, 0.0, 20.0],
            ["f<-20", "f-20-0", "f0-20", "f20+"], _asset_col("funding"),
        ),
        SpotFeature(
            "fundz", "fund_z30", [-1.5, 1.5],
            ["fz<-1.5", "fz-1.5-1.5", "fz1.5+"], _derived_key("funding", "zscore_30d"),
        ),
        SpotFeature(
            "ret24", "ret_24h_pct", [-2.0, 0.0, 2.0],
            ["r<-2", "r-2-0", "r0-2", "r2+"], _derived_key("price", "change_pct_24h"),
        ),
        SpotFeature(
            "hi7", "pct_from_7d_high", [-5.0, -2.0],
            ["h<-5", "h-5--2", "h-2+"], _derived_key("price", "pct_from_7d_high"),
        ),
        SpotFeature(
            "sma30", "pct_vs_30d_sma", [-3.0, 0.0, 3.0],
            ["s<-3", "s-3-0", "s0-3", "s3+"], _derived_key("price", "pct_vs_30d_sma"),
        ),
        SpotFeature(
            "pcr", "pc_pctile_30d", [20.0, 80.0],
            ["pc<20", "pc20-80", "pc80+"], _derived_key("pc", "percentile_30d"),
        ),
        SpotFeature(
            "ivts", "iv_term_spread_pts", [0.0, 5.0],
            ["iv<0", "iv0-5", "iv5+"], _asset_col("ivts_col"),
        ),
        SpotDowFeature(),
        # --- Panel-only features (no catalog key): mined, reported as
        # coverage gaps rather than authorable opportunities. ---
        SpotFeature(
            "rvol", "realized_vol_30d_pct", [1.0, 2.5],
            ["v<1", "v1-2.5", "v2.5+"], _no_key,
        ),
        SpotFeature(
            "macro", "macro_composite", [-0.25, 0.25],
            ["mac<0", "mac~0", "mac>0"], _no_key,
        ),
    ]


# Pairs curated to keep the BH test family small; ~141 days of history means
# fine cells cannot reach min-n yet anyway. No triples until the panel has
# enough days that a triple cell can clear MIN_N_DISCOVERY honestly.
SPOT_PAIR_STRATIFICATIONS: tuple[tuple[str, str], ...] = (
    ("fund", "dow"),
    ("fundz", "dow"),
    ("fund", "ret24"),
    ("fund", "sma30"),
    ("ret24", "hi7"),
    ("ret24", "sma30"),
    ("pcr", "ret24"),
    ("pcr", "sma30"),
    ("macro", "ret24"),
    ("ivts", "ret24"),
)


def dedupe_non_overlapping_spot(
    rows: list[dict[str, Any]], horizon_days: int
) -> list[dict[str, Any]]:
    """At most one row per asset per horizon window: adjacent daily entries
    share their forward window, so counting both would overstate n."""
    by_asset: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_asset[str(row.get("asset"))].append(row)
    kept: list[dict[str, Any]] = []
    for asset_rows in by_asset.values():
        asset_rows.sort(key=lambda r: str(r.get("entry_date")))
        last: date | None = None
        for row in asset_rows:
            try:
                day = date.fromisoformat(str(row.get("entry_date")))
            except ValueError:
                continue
            if last is None or (day - last).days >= horizon_days:
                kept.append(row)
                last = day
    kept.sort(key=lambda r: (str(r.get("entry_date")), str(r.get("asset"))))
    return kept
