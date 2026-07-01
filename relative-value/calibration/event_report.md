# NO-bias calibration: event-level report

- Rows in log: 110860 | unique markets: 375
- Resolved markets (real UMA labels): 75 usable, 281 still open
- Gate-passed markets: resolved 7, still open 18

## Promotion bar: 7 / 200 resolved gate-passed events
Progress: 3.5%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n= 75 | NO-win  81.3% | avg  -11.50% | total   -862.7% | median NO entry 0.979
gate-passed (resolved):  n=  7 | NO-win  85.7% | avg  +23.65% | total   +165.5% | median NO entry 0.710
```

## By asset
```
OIL                    n= 22 | NO-win  72.7% | avg  -22.24% | total   -489.3% | median NO entry 0.962
GOLD                   n= 20 | NO-win  75.0% | avg  -21.76% | total   -435.2% | median NO entry 0.986
BTC                    n= 16 | NO-win  93.8% | avg   +4.82% | total    +77.1% | median NO entry 0.992
SPY                    n= 10 | NO-win  90.0% | avg   +7.96% | total    +79.6% | median NO entry 0.880
ETH                    n=  7 | NO-win  85.7% | avg  -13.55% | total    -94.9% | median NO entry 0.997
```

## By adjusted gap bin (at entry)
```
<0-0                   n= 66 | NO-win  81.8% | avg  -14.36% | total   -948.1% | median NO entry 0.986
0-4                    n=  4 | NO-win  75.0% | avg   +2.49% | total    +10.0% | median NO entry 0.710
>=12                   n=  3 | NO-win 100.0% | avg  +53.91% | total   +161.7% | median NO entry 0.620
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
4-8                    n=  1 | NO-win 100.0% | avg  +13.64% | total    +13.6% | median NO entry 0.880
```

## By moneyness bucket
```
5-15%                  n= 26 | NO-win  84.6% | avg   -8.04% | total   -209.0% | median NO entry 0.948
<5%                    n= 18 | NO-win  50.0% | avg  -32.14% | total   -578.4% | median NO entry 0.575
15-30%                 n= 16 | NO-win  93.8% | avg   -4.90% | total    -78.4% | median NO entry 0.992
>30%                   n= 15 | NO-win 100.0% | avg   +0.21% | total     +3.1% | median NO entry 0.999
```

## By DTE bucket
```
0-7d                   n= 56 | NO-win  92.9% | avg   -0.76% | total    -42.3% | median NO entry 0.992
31-90d                 n= 18 | NO-win  50.0% | avg  -40.02% | total   -720.4% | median NO entry 0.765
8-30d                  n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.800
```

## By contract type / direction
```
touch/below            n= 38 | NO-win  68.4% | avg  -26.65% | total  -1012.5% | median NO entry 0.943
touch/above            n= 37 | NO-win  94.6% | avg   +4.05% | total   +149.8% | median NO entry 0.985
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
