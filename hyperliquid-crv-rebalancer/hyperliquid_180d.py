"""
Analyze PURR, FARTCOIN, PUMP with 180-day Hyperliquid data.
Compare with previous 90-day results.
"""
import json, os, math, statistics, sys

COINS_CONF = {
    "purr":     {"name": "Purr",     "symbol": "PURR",     "go_long": True},
    "fartcoin": {"name": "Fartcoin", "symbol": "FARTCOIN", "go_long": True},
    "pump":     {"name": "Pump",     "symbol": "PUMP",     "go_long": True},
}

INITIAL_CAPITAL = 10_000.0
LEVERAGE = 2
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

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

    lag1 = sum((a - mean_r) * (b - mean_r) for a, b in zip(lr[:-1], lr[1:]))
    denom = sum((x - mean_r)**2 for x in lr)
    ac1 = lag1 / denom if denom != 0 else 0

    def hurst(ts):
        lags = range(2, min(101, len(ts)//2))
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

    # Daily vol
    daily_lr = []
    for i in range(24, len(prices)):
        daily_lr.append(math.log(prices[i] / prices[i-24]))
    daily_vol = statistics.stdev(daily_lr) if len(daily_lr) >= 2 else 0

    print(f"  Current price:       ${prices[-1]:.6f}")
    print(f"  Price range:         ${min(prices):.4f} – ${max(prices):.4f}")
    print(f"  Mean price:          ${statistics.mean(prices):.6f}")
    print(f"  Hourly log return:   mean={mean_r:.6f}, std={std_r:.6f}")
    print(f"  Annualized vol:      {ann_vol:.1f}%")
    print(f"  Annualized return:   {ann_ret:.1f}%")
    print(f"  VaR 95% (hourly):    {var_95*100:.3f}%")
    print(f"  CVaR 95% (hourly):   {cvar_95*100:.3f}%")
    print(f"  Lag-1 autocorr:      {ac1:.4f}")
    print(f"  Hurst exponent:      {h:.4f}  ({'trending' if h > 0.55 else 'mean-reverting' if h < 0.45 else 'random'})")
    print(f"  Daily vol (est):     {daily_vol*100:.2f}%")
    return {"lr": lr, "ann_vol": ann_vol, "ann_ret": ann_ret, "daily_vol": daily_vol, "ac1": ac1, "hurst": h, "prices": prices}

def backtest_trend(prices, ema_period, entry_pct, exit_pct, go_long=True, capital=INITIAL_CAPITAL):
    ema = compute_ema(prices, ema_period)
    if len(prices) < 2 or ema_period >= len(prices):
        return None
    equity = [capital]
    in_pos = False
    entry_p = None
    entry_cap = None
    trades = wins = 0

    for i in range(ema_period, len(prices)):
        p, e = prices[i], ema[i]
        if e is None:
            equity.append(capital); continue
        if not in_pos:
            if (go_long and p > e * (1 + entry_pct/100)) or (not go_long and p < e * (1 - entry_pct/100)):
                in_pos, entry_p, entry_cap = True, p, capital
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
    peak = equity[0]; mdd = 0
    for v in equity:
        if v > peak: peak = v
        dd = (peak - v)/peak * 100
        if dd > mdd: mdd = dd
    wr = (wins/trades*100) if trades else 0
    return {"total_return_pct": total_ret, "sharpe": sh, "max_drawdown_pct": mdd,
            "trades": trades, "win_rate": wr, "final_capital": capital}

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

def show_top(results, name, n=10):
    by_sharpe = sorted(results, key=lambda x: x["sharpe"], reverse=True)[:n]
    print(f"  {'#':<4} {'EMA':<5} {'Entry':<7} {'Exit':<7} {'Sharpe':<8} {'Return':<10} {'MaxDD':<8} {'Trades':<7} {'Win%':<7}")
    print(f"  {'-'*58}")
    for i, r in enumerate(by_sharpe, 1):
        print(f"  {i:<4} {r['ema']:<5}h {r['entry']:<7}% {r['exit']:<7}% {r['sharpe']:<8.2f} {r['total_return_pct']:<+9.1f}% {r['max_drawdown_pct']:<7.2f}% {r['trades']:<7} {r['win_rate']:<5.1f}%")
    return by_sharpe

def main():
    print("=" * 70)
    print("  180-DAY HYPERLIQUID ANALYSIS — PURR, FARTCOIN, PUMP")
    print(f"  Capital: ${INITIAL_CAPITAL:,.0f} @ {LEVERAGE}x")
    print(f"  Data: Nov 27, 2025 – May 26, 2026 (Hyperliquid API)")
    print("=" * 70)

    all_data = {}

    for coin_id, conf in COINS_CONF.items():
        name = conf["name"]
        go_long = conf["go_long"]

        path = os.path.join(OUT_DIR, f"{coin_id}_prices_180d.json")
        if not os.path.exists(path):
            print(f"\n  SKIP {name}: no 180d data file")
            continue
        with open(path) as f:
            prices = json.load(f)
        if len(prices) < 100:
            print(f"\n  SKIP {name}: only {len(prices)} points")
            continue

        print(f"\n{'#'*70}")
        print(f"  {name} ({conf['symbol']}) — {len(prices)} hourly candles")
        print(f"{'#'*70}")

        stats = stochastic_summary(prices, name)

        # Also compute buy-and-hold return over 180 days
        bnh = (prices[-1] / prices[0] - 1) * 100
        print(f"  Buy & Hold (180d):   {bnh:+.1f}%")

        print(f"\n  Running grid search...")
        results = grid_search(prices, go_long)
        print(f"  {len(results)} valid strategies")

        top10 = show_top(results, name)

        # Margin analysis of top 5
        top5 = top10[:5]
        print(f"\n  {'='*70}")
        print(f"  {name} — 2x Margin Analysis")
        print(f"  {'='*70}")
        print(f"  {'#':<4} {'EMA':<5} {'Entry':<7} {'Exit':<7} {'Return':<10} {'Sharpe':<8} {'MaxDD':<8} {'Liqs':<6} {'Trades':<7} {'Win%':<7}")
        print(f"  {'-'*65}")
        for i, r in enumerate(top5, 1):
            mr = margin_backtest(prices, r["ema"], r["entry"], r["exit"], LEVERAGE, go_long)
            if mr:
                print(f"  {i:<4} {r['ema']:<5}h {r['entry']:<7}% {r['exit']:<7}% {mr['total_return_pct']:<+9.1f}% {mr['sharpe']:<8.2f} {mr['max_drawdown_pct']:<7.2f}% {mr['liquidations']:<6} {mr['trades']:<7} {mr['win_rate']:<5.1f}%")

        # Splitting 180d into first 90 and last 90 for comparison
        split = len(prices) // 2
        p1 = prices[:split]
        p2 = prices[split:]
        if coin_id in ("purr", "fartcoin"):
            r1 = backtest_trend(p1, top5[0]["ema"], top5[0]["entry"], top5[0]["exit"], go_long)
            r2 = backtest_trend(p2, top5[0]["ema"], top5[0]["entry"], top5[0]["exit"], go_long)
            print(f"\n  Consistency check (top strat across halves):")
            print(f"    Earlier 90d: {r1['total_return_pct']:+.1f}% return, {r1['sharpe']:.2f} Sharpe, {r1['trades']} trades")
            print(f"    Recent  90d: {r2['total_return_pct']:+.1f}% return, {r2['sharpe']:.2f} Sharpe, {r2['trades']} trades")

        # Liquidation risk
        dv = stats["daily_vol"]
        sigma_move_liq = (1/LEVERAGE - 0.05) / dv if dv > 0 else 0
        print(f"\n  Liquidation risk (2x): {sigma_move_liq:.1f}σ to liq — {'LOW' if sigma_move_liq > 4 else 'MODERATE' if sigma_move_liq > 2.5 else 'HIGH'} risk")

        all_data[coin_id] = {"stats": stats, "results": results, "prices": prices, "top": top5}

    # Cross-coin comparison
    print(f"\n\n{'='*70}")
    print("  CROSS-COIN COMPARISON — Best Strategy at 2x (180 days)")
    print(f"{'='*70}")
    print(f"  {'Coin':<12} {'Strategy':<20} {'Buy&Hold':<9} {'1x Ret':<9} {'2x Ret':<9} {'Sharpe':<8} {'MaxDD':<7} {'Liqs':<6}")
    print(f"  {'-'*76}")
    for coin_id in ["purr", "fartcoin", "pump"]:
        if coin_id not in all_data:
            continue
        conf = COINS_CONF[coin_id]
        top = sorted(all_data[coin_id]["results"], key=lambda x: x["sharpe"], reverse=True)[0]
        prices = all_data[coin_id]["prices"]
        bnh = (prices[-1] / prices[0] - 1) * 100
        cash = backtest_trend(prices, top["ema"], top["entry"], top["exit"], conf["go_long"])
        margin = margin_backtest(prices, top["ema"], top["entry"], top["exit"], LEVERAGE, conf["go_long"])
        strat = f"{top['ema']}h E:{top['entry']}% X:{top['exit']}%"
        if cash and margin:
            print(f"  {conf['name']:<12} {strat:<20} {bnh:<+8.1f}% {cash['total_return_pct']:<+8.1f}% {margin['total_return_pct']:<+8.1f}% {margin['sharpe']:<8.2f} {margin['max_drawdown_pct']:<6.1f}% {margin['liquidations']:<6}")

    # Verdict
    print(f"\n\n{'='*70}")
    print("  VERDICT (180-day data from Hyperliquid)")
    print(f"{'='*70}")
    for coin_id in ["purr", "fartcoin", "pump"]:
        if coin_id not in all_data:
            print(f"\n  {COINS_CONF[coin_id]['name']}: No data")
            continue
        conf = COINS_CONF[coin_id]
        s = all_data[coin_id]["stats"]
        top = sorted(all_data[coin_id]["results"], key=lambda x: x["sharpe"], reverse=True)[0]
        h = s["hurst"]
        ac = s["ac1"]
        vol = s["ann_vol"]
        prices = all_data[coin_id]["prices"]
        bnh = (prices[-1] / prices[0] - 1) * 100
        mr = margin_backtest(prices, top["ema"], top["entry"], top["exit"], LEVERAGE, conf["go_long"])

        trend = "TRENDING" if h > 0.55 else "RANDOM" if h > 0.45 else "MEAN-REVERTING"
        verdict = "✅ WORKS" if h > 0.55 else "❌ DOES NOT WORK" if h < 0.45 else "⚠️ MARGINAL"

        print(f"\n  {conf['name']}: {verdict} (Hurst={h:.3f} — {trend})")
        print(f"    Buy & Hold 180d: {bnh:+.1f}%")
        print(f"    Best: {top['ema']}h EMA, entry>{top['entry']}%, exit<{top['exit']}%")
        if mr:
            print(f"    1x: {top['total_return_pct']:+.1f}% | 2x: {mr['total_return_pct']:+.1f}% | DD: {mr['max_drawdown_pct']:.1f}% | Liqs: {mr['liquidations']}")

    print(f"\n{'='*70}")
    print("  DONE")
    print(f"{'='*70}")

if __name__ == "__main__":
    main()
