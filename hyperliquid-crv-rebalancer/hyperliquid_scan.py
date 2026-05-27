"""
Hyperliquid Coin Scanner — Full Analysis Pipeline
==================================================
Analyzes fartcoin, purr, and pump for trend-following
strategies on Hyperliquid with 2x margin.
"""
import json, os, math, statistics, sys

COINS_CONF = {
    "fartcoin": {"name": "Fartcoin", "symbol": "FARTCOIN", "go_long": True},
    "purr":     {"name": "Purr",     "symbol": "PURR",     "go_long": True},
    "pump":     {"name": "Pump",     "symbol": "PUMP",     "go_long": True},
}

INITIAL_CAPITAL = 10_000.0
LEVERAGE = 2
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------- helpers ----------
def compute_ema(prices, period):
    if len(prices) < period:
        return [None] * len(prices)
    k = 2.0 / (period + 1)
    ema = [None] * len(prices)
    ema[period-1] = sum(prices[:period]) / period
    for i in range(period, len(prices)):
        ema[i] = prices[i] * k + ema[i-1] * (1 - k)
    return ema

def log_returns(prices):
    return [math.log(prices[i] / prices[i-1]) for i in range(1, len(prices))]

def sharpe_ratio(returns, af=8760):
    if len(returns) < 2:
        return 0.0
    std = statistics.stdev(returns)
    return (statistics.mean(returns) / std * math.sqrt(af)) if std != 0 else 0.0

# ---------- stochastic ----------
def stochastic_summary(prices, name):
    lr = log_returns(prices)
    mean_r = statistics.mean(lr)
    std_r = statistics.stdev(lr)
    ann_vol = std_r * math.sqrt(8760) * 100
    ann_ret = mean_r * 8760 * 100
    sorted_lr = sorted(lr)
    n = len(sorted_lr)
    var_95 = sorted_lr[int(n * 0.05)]
    cvar_95 = statistics.mean(sorted_lr[:int(n * 0.05)])

    # Lag-1 autocorrelation
    lag1 = sum((a - mean_r) * (b - mean_r) for a, b in zip(lr[:-1], lr[1:]))
    denom = sum((x - mean_r)**2 for x in lr)
    ac1 = lag1 / denom if denom != 0 else 0

    # Hurst exponent
    def hurst(ts):
        lags = range(2, min(51, len(ts)//2))
        tau = []
        for lag in lags:
            diff = [abs(ts[i] - ts[i-lag]) for i in range(lag, len(ts))]
            tau.append(statistics.mean(diff))
        log_lags = [math.log(l) for l in lags]
        log_tau = [math.log(t) for t in tau]
        n_ = len(log_lags)
        sx, sy = sum(log_lags), sum(log_tau)
        sxx = sum(x*x for x in log_lags)
        sxy = sum(x*y for x, y in zip(log_lags, log_tau))
        return (n_ * sxy - sx * sy) / (n_ * sxx - sx**2)

    h = hurst(prices)

    # Daily vol from daily returns
    daily_lr = []
    step = max(1, len(prices) // 90)
    for i in range(step, len(prices), step):
        daily_lr.append(math.log(prices[i] / prices[i-step]))
    daily_vol = statistics.stdev(daily_lr) if len(daily_lr) >= 2 else 0

    print(f"  Current price:       ${prices[-1]:.6f}")
    print(f"  Price range:         ${min(prices):.6f} – ${max(prices):.6f}")
    print(f"  Mean price:          ${statistics.mean(prices):.6f}")
    print(f"  Hourly log return:   mean={mean_r:.6f}, std={std_r:.6f}")
    print(f"  Annualized vol:      {ann_vol:.1f}%")
    print(f"  Annualized return:   {ann_ret:.1f}%")
    print(f"  VaR 95% (hourly):    {var_95*100:.3f}%")
    print(f"  CVaR 95% (hourly):   {cvar_95*100:.3f}%")
    print(f"  Lag-1 autocorr:      {ac1:.4f}")
    print(f"  Hurst exponent:      {h:.4f}  ({'trending' if h > 0.55 else 'mean-reverting' if h < 0.45 else 'random'})")
    print(f"  Daily vol (est):     {daily_vol*100:.2f}%")

    return {"lr": lr, "ann_vol": ann_vol, "ann_ret": ann_ret, "daily_vol": daily_vol, "ac1": ac1, "hurst": h}

# ---------- backtest ----------
def backtest_trend(prices, ema_period, entry_pct, exit_pct, go_long=True):
    ema = compute_ema(prices, ema_period)
    if len(prices) < 2 or ema_period >= len(prices):
        return None
    capital = INITIAL_CAPITAL
    equity = [capital]
    in_pos = False
    entry_p = None
    trades = wins = 0

    for i in range(ema_period, len(prices)):
        p, e = prices[i], ema[i]
        if e is None:
            equity.append(capital); continue
        if not in_pos:
            if (go_long and p > e * (1 + entry_pct/100)) or (not go_long and p < e * (1 - entry_pct/100)):
                in_pos, entry_p = True, p
                trades += 1
        else:
            exit_sig = (go_long and p < e * (1 - exit_pct/100)) or (not go_long and p > e * (1 + exit_pct/100))
            if exit_sig:
                ret = (p/entry_p - 1) if go_long else (entry_p/p - 1)
                capital *= (1 + ret)
                if ret > 0: wins += 1
                in_pos = False
        equity.append(capital)

    if in_pos:
        p = prices[-1]
        ret = (p/entry_p - 1) if go_long else (entry_p/p - 1)
        capital *= (1 + ret)
        if ret > 0: wins += 1

    total_ret = (capital / INITIAL_CAPITAL - 1) * 100
    rets = [equity[i]/equity[i-1]-1 for i in range(1, len(equity)) if equity[i-1] > 0]
    sh = sharpe_ratio(rets)
    peak = equity[0]
    mdd = 0
    for v in equity:
        if v > peak: peak = v
        dd = (peak - v)/peak * 100
        if dd > mdd: mdd = dd
    wr = (wins/trades*100) if trades else 0
    return {"total_return_pct": total_ret, "sharpe": sh, "max_drawdown_pct": mdd,
            "trades": trades, "win_rate": wr}

# ---------- grid search ----------
def grid_search(prices, go_long=True):
    results = []
    for ep in range(2, 50):
        for ent in [0, 1, 2, 3, 4, 5]:
            for ext in [0, 1, 2, 3, 4, 5]:
                r = backtest_trend(prices, ep, ent, ext, go_long)
                if r:
                    r["ema"] = ep
                    r["entry"] = ent
                    r["exit"] = ext
                    results.append(r)
    return results

def show_top_strategies(results, name, n=10):
    by_sharpe = sorted(results, key=lambda x: x["sharpe"], reverse=True)[:n]
    print(f"  {'#':<4} {'EMA':<5} {'Entry':<7} {'Exit':<7} {'Sharpe':<8} {'Return':<9} {'MaxDD':<8} {'Trades':<7} {'Win%':<7}")
    print(f"  {'-'*56}")
    for i, r in enumerate(by_sharpe, 1):
        print(f"  {i:<4} {r['ema']:<5}h {r['entry']:<7}% {r['exit']:<7}% {r['sharpe']:<8.2f} {r['total_return_pct']:<+8.1f}% {r['max_drawdown_pct']:<7.2f}% {r['trades']:<7} {r['win_rate']:<5.1f}%")

# ---------- margin ----------
def margin_backtest(prices, ema_period, entry_pct, exit_pct, leverage, go_long=True):
    ema = compute_ema(prices, ema_period)
    if len(prices) < 2 or ema_period >= len(prices):
        return None
    capital = INITIAL_CAPITAL
    equity = [capital]
    in_pos = False
    entry_p = entry_cap = liq_p = None
    trades = wins = liqs = 0
    mm = 0.05

    for i in range(ema_period, len(prices)):
        p, e = prices[i], ema[i]
        if e is None:
            equity.append(capital); continue
        if not in_pos:
            signal = (go_long and p > e * (1 + entry_pct/100)) or (not go_long and p < e * (1 - entry_pct/100))
            if signal:
                in_pos, entry_p, entry_cap = True, p, capital
                liq_p = entry_p * (1 - 1/leverage + mm) if go_long else entry_p * (1 + 1/leverage - mm)
                trades += 1
        else:
            liqd = (go_long and p <= liq_p) or (not go_long and p >= liq_p)
            if liqd:
                capital *= (1 - 1/leverage + mm - 0.02)
                if capital < 0: capital = 0
                liqs += 1
                in_pos = False
            else:
                exit_sig = (go_long and p < e * (1 - exit_pct/100)) or (not go_long and p > e * (1 + exit_pct/100))
                if exit_sig:
                    raw = (p/entry_p - 1) if go_long else (entry_p/p - 1)
                    lret = raw * leverage
                    capital = entry_cap * (1 + lret)
                    if lret > 0: wins += 1
                    in_pos = False
        equity.append(capital)

    if in_pos:
        p = prices[-1]
        raw = (p/entry_p - 1) if go_long else (entry_p/p - 1)
        capital = entry_cap * (1 + raw * leverage)
        if raw * leverage > 0: wins += 1

    total_ret = (capital / INITIAL_CAPITAL - 1) * 100
    rets = [equity[i]/equity[i-1]-1 for i in range(1, len(equity)) if equity[i-1] > 0]
    sh = sharpe_ratio(rets)
    peak = equity[0]; mdd = 0
    for v in equity:
        if v > peak: peak = v
        dd = (peak - v)/peak * 100
        if dd > mdd: mdd = dd
    wr = (wins/trades*100) if trades else 0
    return {"total_return_pct": total_ret, "sharpe": sh, "max_drawdown_pct": mdd,
            "trades": trades, "win_rate": wr, "liquidations": liqs, "final_capital": capital}

# ---------- main ----------
def main():
    print("=" * 70)
    print("  HYPERLIQUID COIN SCANNER — fartcoin, purr, pump")
    print(f"  Capital: ${INITIAL_CAPITAL:,.0f} @ {LEVERAGE}x")
    print("=" * 70)

    all_data = {}

    for coin_id, conf in COINS_CONF.items():
        name = conf["name"]
        go_long = conf["go_long"]

        # Load prices
        path = os.path.join(OUT_DIR, f"{coin_id}_prices.json")
        if not os.path.exists(path):
            print(f"\n  SKIP {name}: no price data file")
            continue
        with open(path) as f:
            prices = json.load(f)
        if len(prices) < 20:
            print(f"\n  SKIP {name}: only {len(prices)} data points (too few)")
            continue

        print(f"\n{'#'*70}")
        print(f"  {name} ({conf['symbol']}) — {len(prices)} data points")
        print(f"{'#'*70}")

        stats = stochastic_summary(prices, name)

        print(f"\n  Running grid search (49 × 6 × 6 = 1,764 combos)...")
        results = grid_search(prices, go_long)
        print(f"  Found {len(results)} valid strategies")
        show_top_strategies(results, name)

        # Margin analysis of top 5 by Sharpe
        top5 = sorted(results, key=lambda x: x["sharpe"], reverse=True)[:5]
        print(f"\n  {'='*70}")
        print(f"  {name} — 2x Margin Analysis (${INITIAL_CAPITAL:,.0f})")
        print(f"  {'='*70}")
        print(f"  {'#':<4} {'EMA':<5} {'Entry':<7} {'Exit':<7} {'Return':<10} {'Sharpe':<8} {'MaxDD':<8} {'Liqs':<6} {'Trades':<7} {'Win%':<7}")
        print(f"  {'-'*65}")
        for i, r in enumerate(top5, 1):
            mr = margin_backtest(prices, r["ema"], r["entry"], r["exit"], LEVERAGE, go_long)
            if mr:
                print(f"  {i:<4} {r['ema']:<5}h {r['entry']:<7}% {r['exit']:<7}% {mr['total_return_pct']:<+9.1f}% {mr['sharpe']:<8.2f} {mr['max_drawdown_pct']:<7.2f}% {mr['liquidations']:<6} {mr['trades']:<7} {mr['win_rate']:<5.1f}%")

        # Liquidation prob estimate
        dv = stats["daily_vol"]
        sigma_move_liq = (1/LEVERAGE - 0.05) / dv if dv > 0 else 0
        print(f"\n  Liquidation analysis (2x):")
        print(f"  Daily vol: {dv*100:.2f}%")
        print(f"  Distance to liq: {100/LEVERAGE - 5:.1f}% adverse move")
        print(f"  That's ~{sigma_move_liq:.1f}σ daily move — {'LOW' if sigma_move_liq > 4 else 'MODERATE' if sigma_move_liq > 2.5 else 'HIGH'} risk")

        all_data[coin_id] = {"stats": stats, "results": results}

    # Cross-coin comparison
    print(f"\n\n{'='*70}")
    print("  CROSS-COIN COMPARISON — Best Strategy at 2x")
    print(f"{'='*70}")
    print(f"  {'Coin':<12} {'Strategy':<18} {'1x Ret':<8} {'2x Ret':<9} {'Sharpe':<8} {'MaxDD':<7} {'Liqs':<6}")
    print(f"  {'-'*68}")
    for coin_id in ["fartcoin", "purr", "pump"]:
        if coin_id not in all_data:
            continue
        conf = COINS_CONF[coin_id]
        top = sorted(all_data[coin_id]["results"], key=lambda x: x["sharpe"], reverse=True)[0]
        path = os.path.join(OUT_DIR, f"{coin_id}_prices.json")
        with open(path) as f:
            prices = json.load(f)
        cash = backtest_trend(prices, top["ema"], top["entry"], top["exit"], conf["go_long"])
        margin = margin_backtest(prices, top["ema"], top["entry"], top["exit"], LEVERAGE, conf["go_long"])
        strat = f"{top['ema']}h E:{top['entry']}% X:{top['exit']}%"
        if cash and margin:
            print(f"  {conf['name']:<12} {strat:<18} {cash['total_return_pct']:<+7.1f}% {margin['total_return_pct']:<+8.1f}% {margin['sharpe']:<8.2f} {margin['max_drawdown_pct']:<6.1f}% {margin['liquidations']:<6}")

    # Verdict
    print(f"\n\n{'='*70}")
    print("  VERDICT — which coins work for trend following on Hyperliquid?")
    print(f"{'='*70}")

    for coin_id in ["fartcoin", "purr", "pump"]:
        if coin_id not in all_data:
            print(f"\n  {COINS_CONF[coin_id]['name']}: Insufficient data")
            continue

        conf = COINS_CONF[coin_id]
        s = all_data[coin_id]["stats"]
        top = sorted(all_data[coin_id]["results"], key=lambda x: x["sharpe"], reverse=True)[0]
        h = s["hurst"]
        ac = s["ac1"]
        vol = s["ann_vol"]

        verdict = "LIKELY WORKS" if h > 0.55 else "MARGINAL" if h > 0.5 else "DOES NOT WORK"
        print(f"\n  {conf['name']}: {verdict}")
        print(f"    Hurst={h:.3f} | AC1={ac:.4f} | AnnVol={vol:.1f}%")
        print(f"    Best: {top['ema']}h EMA, Entry>{top['entry']}%, Exit<{top['exit']}%")
        print(f"    Sharpe {top['sharpe']:.2f}, Return {top['total_return_pct']:.1f}%")

    print(f"\n{'='*70}")
    print("  DONE")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
