# NO-bias calibration: event-level report

- Rows in log: 40423 | unique markets: 329
- Resolved markets (real UMA labels): 56 usable, 254 still open
- Gate-passed markets: resolved 7, still open 12

## Promotion bar: 7 / 200 resolved gate-passed events
Progress: 3.5%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n= 56 | NO-win  92.9% | avg   -0.76% | total    -42.3% | median NO entry 0.992
gate-passed (resolved):  n=  7 | NO-win  85.7% | avg  +23.65% | total   +165.5% | median NO entry 0.710
```

## By asset
```
OIL                    n= 17 | NO-win  94.1% | avg   +0.63% | total    +10.7% | median NO entry 0.990
GOLD                   n= 16 | NO-win  93.8% | avg   -2.20% | total    -35.2% | median NO entry 0.996
BTC                    n= 16 | NO-win  93.8% | avg   +4.82% | total    +77.1% | median NO entry 0.992
ETH                    n=  7 | NO-win  85.7% | avg  -13.55% | total    -94.9% | median NO entry 0.997
```

## By adjusted gap bin (at entry)
```
<0-0                   n= 48 | NO-win  93.8% | avg   -4.74% | total   -227.6% | median NO entry 0.996
0-4                    n=  3 | NO-win 100.0% | avg  +36.65% | total   +110.0% | median NO entry 0.720
>=12                   n=  3 | NO-win 100.0% | avg  +53.91% | total   +161.7% | median NO entry 0.620
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
4-8                    n=  1 | NO-win 100.0% | avg  +13.64% | total    +13.6% | median NO entry 0.880
```

## By moneyness bucket
```
5-15%                  n= 17 | NO-win 100.0% | avg   +7.01% | total   +119.2% | median NO entry 0.983
>30%                   n= 15 | NO-win 100.0% | avg   +0.21% | total     +3.1% | median NO entry 0.999
15-30%                 n= 13 | NO-win 100.0% | avg   +1.11% | total    +14.5% | median NO entry 0.994
<5%                    n= 11 | NO-win  63.6% | avg  -16.28% | total   -179.1% | median NO entry 0.720
```

## By DTE bucket
```
0-7d                   n= 56 | NO-win  92.9% | avg   -0.76% | total    -42.3% | median NO entry 0.992
```

## By contract type / direction
```
touch/above            n= 33 | NO-win  97.0% | avg   +4.31% | total   +142.1% | median NO entry 0.994
touch/below            n= 23 | NO-win  87.0% | avg   -8.02% | total   -184.4% | median NO entry 0.991
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
