# NO-bias calibration: event-level report

- Rows in log: 122557 | unique markets: 419
- Resolved markets (real UMA labels): 242 usable, 157 still open
- Gate-passed markets: resolved 14, still open 11

## Promotion bar: 14 / 200 resolved gate-passed events
Progress: 7.0%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n=242 | NO-win  81.4% | avg   +8.76% | total  +2119.2% | median NO entry 0.950
gate-passed (resolved):  n= 14 | NO-win  64.3% | avg  -10.32% | total   -144.5% | median NO entry 0.672
```

## By asset
```
OIL                    n= 90 | NO-win  77.8% | avg  +14.92% | total  +1343.1% | median NO entry 0.920
GOLD                   n= 73 | NO-win  84.9% | avg   -1.11% | total    -80.9% | median NO entry 0.968
BTC                    n= 41 | NO-win  82.9% | avg  +19.37% | total   +794.1% | median NO entry 0.947
ETH                    n= 28 | NO-win  78.6% | avg   -0.59% | total    -16.6% | median NO entry 0.964
SPY                    n= 10 | NO-win  90.0% | avg   +7.96% | total    +79.6% | median NO entry 0.880
```

## By adjusted gap bin (at entry)
```
<0-0                   n=225 | NO-win  81.8% | avg   +9.21% | total  +2071.5% | median NO entry 0.953
0-4                    n= 11 | NO-win  72.7% | avg   -6.80% | total    -74.8% | median NO entry 0.750
>=12                   n=  3 | NO-win 100.0% | avg  +53.91% | total   +161.7% | median NO entry 0.620
4-8                    n=  2 | NO-win 100.0% | avg  +30.35% | total    +60.7% | median NO entry 0.780
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
```

## By moneyness bucket
```
>30%                   n= 77 | NO-win  92.2% | avg   -6.14% | total   -472.8% | median NO entry 0.988
5-15%                  n= 69 | NO-win  79.7% | avg  +11.40% | total   +786.4% | median NO entry 0.830
15-30%                 n= 61 | NO-win  86.9% | avg  +24.93% | total  +1520.5% | median NO entry 0.960
<5%                    n= 35 | NO-win  51.4% | avg   +8.15% | total   +285.1% | median NO entry 0.500
```

## By DTE bucket
```
31-90d                 n=102 | NO-win  81.4% | avg   -7.51% | total   -765.8% | median NO entry 0.955
8-30d                  n= 78 | NO-win  71.8% | avg  +36.48% | total  +2845.8% | median NO entry 0.800
0-7d                   n= 62 | NO-win  93.5% | avg   +0.63% | total    +39.1% | median NO entry 0.990
```

## By contract type / direction
```
touch/above            n=117 | NO-win  95.7% | avg  +27.70% | total  +3240.8% | median NO entry 0.950
touch/below            n= 85 | NO-win  63.5% | avg  -33.38% | total  -2837.1% | median NO entry 0.950
settlement/above       n= 38 | NO-win  76.3% | avg  +45.12% | total  +1714.4% | median NO entry 0.910
settlement/below       n=  2 | NO-win 100.0% | avg   +0.55% | total     +1.1% | median NO entry 0.994
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
