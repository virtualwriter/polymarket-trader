# NO-bias calibration: event-level report

- Rows in log: 5958 | unique markets: 701
- Resolved markets (real UMA labels): 443 usable, 194 still open
- Gate-passed markets: resolved 19, still open 13

## Promotion bar: 19 / 200 resolved gate-passed events
Progress: 9.5%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n=443 | NO-win  71.3% | avg   -1.74% | total   -772.7% | median NO entry 0.910
gate-passed (resolved):  n= 19 | NO-win  52.6% | avg  -24.85% | total   -472.1% | median NO entry 0.600
```

## By asset
```
OIL                    n=136 | NO-win  72.8% | avg   +6.57% | total   +893.4% | median NO entry 0.855
GOLD                   n=111 | NO-win  79.3% | avg   -1.21% | total   -134.3% | median NO entry 0.950
BTC                    n=104 | NO-win  67.3% | avg   -0.40% | total    -41.3% | median NO entry 0.900
ETH                    n= 82 | NO-win  61.0% | avg  -19.15% | total  -1570.0% | median NO entry 0.865
SPY                    n= 10 | NO-win  90.0% | avg   +7.96% | total    +79.6% | median NO entry 0.880
```

## By adjusted gap bin (at entry)
```
<0-0                   n=396 | NO-win  72.2% | avg   -1.85% | total   -731.9% | median NO entry 0.930
0-4                    n= 26 | NO-win  57.7% | avg  -23.38% | total   -607.8% | median NO entry 0.710
>=12                   n= 16 | NO-win  75.0% | avg  +31.45% | total   +503.2% | median NO entry 0.610
4-8                    n=  3 | NO-win 100.0% | avg  +87.91% | total   +263.7% | median NO entry 0.680
8-12                   n=  2 | NO-win   0.0% | avg -100.00% | total   -200.0% | median NO entry 0.425
```

## By moneyness bucket
```
5-15%                  n=124 | NO-win  75.0% | avg   +6.57% | total   +814.3% | median NO entry 0.780
>30%                   n=117 | NO-win  94.0% | avg   -4.18% | total   -489.5% | median NO entry 0.988
<5%                    n=105 | NO-win  30.5% | avg  -19.73% | total  -2071.2% | median NO entry 0.300
15-30%                 n= 97 | NO-win  83.5% | avg  +10.04% | total   +973.7% | median NO entry 0.960
```

## By DTE bucket
```
31-90d                 n=229 | NO-win  77.3% | avg   -5.50% | total  -1258.7% | median NO entry 0.940
8-30d                  n=128 | NO-win  53.9% | avg   +9.29% | total  +1188.9% | median NO entry 0.515
0-7d                   n= 86 | NO-win  81.4% | avg   -8.17% | total   -702.9% | median NO entry 0.980
```

## By contract type / direction
```
touch/above            n=215 | NO-win  73.0% | avg   -5.59% | total  -1201.4% | median NO entry 0.920
touch/below            n=188 | NO-win  68.1% | avg   -6.84% | total  -1286.8% | median NO entry 0.905
settlement/above       n= 38 | NO-win  76.3% | avg  +45.12% | total  +1714.4% | median NO entry 0.910
settlement/below       n=  2 | NO-win 100.0% | avg   +0.55% | total     +1.1% | median NO entry 0.994
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
