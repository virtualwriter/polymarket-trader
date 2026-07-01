# NO-bias calibration: event-level report

- Rows in log: 110597 | unique markets: 374
- Resolved markets (real UMA labels): 66 usable, 289 still open
- Gate-passed markets: resolved 7, still open 18

## Promotion bar: 7 / 200 resolved gate-passed events
Progress: 3.5%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n= 66 | NO-win  78.8% | avg  -15.79% | total  -1042.3% | median NO entry 0.986
gate-passed (resolved):  n=  7 | NO-win  85.7% | avg  +23.65% | total   +165.5% | median NO entry 0.710
```

## By asset
```
OIL                    n= 22 | NO-win  72.7% | avg  -22.24% | total   -489.3% | median NO entry 0.962
GOLD                   n= 20 | NO-win  75.0% | avg  -21.76% | total   -435.2% | median NO entry 0.986
BTC                    n= 16 | NO-win  93.8% | avg   +4.82% | total    +77.1% | median NO entry 0.992
ETH                    n=  7 | NO-win  85.7% | avg  -13.55% | total    -94.9% | median NO entry 0.997
SPY                    n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.120
```

## By adjusted gap bin (at entry)
```
<0-0                   n= 57 | NO-win  78.9% | avg  -19.78% | total  -1127.6% | median NO entry 0.991
0-4                    n=  4 | NO-win  75.0% | avg   +2.49% | total    +10.0% | median NO entry 0.710
>=12                   n=  3 | NO-win 100.0% | avg  +53.91% | total   +161.7% | median NO entry 0.620
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
4-8                    n=  1 | NO-win 100.0% | avg  +13.64% | total    +13.6% | median NO entry 0.880
```

## By moneyness bucket
```
5-15%                  n= 21 | NO-win  81.0% | avg  -13.37% | total   -280.8% | median NO entry 0.970
<5%                    n= 16 | NO-win  43.8% | avg  -42.44% | total   -679.1% | median NO entry 0.570
>30%                   n= 15 | NO-win 100.0% | avg   +0.21% | total     +3.1% | median NO entry 0.999
15-30%                 n= 14 | NO-win  92.9% | avg   -6.11% | total    -85.5% | median NO entry 0.994
```

## By DTE bucket
```
0-7d                   n= 56 | NO-win  92.9% | avg   -0.76% | total    -42.3% | median NO entry 0.992
31-90d                 n=  9 | NO-win   0.0% | avg -100.00% | total   -900.0% | median NO entry 0.420
8-30d                  n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.800
```

## By contract type / direction
```
touch/above            n= 34 | NO-win  94.1% | avg   +1.24% | total    +42.1% | median NO entry 0.992
touch/below            n= 32 | NO-win  62.5% | avg  -33.89% | total  -1084.4% | median NO entry 0.952
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
