# NO-bias calibration: event-level report

- Rows in log: 110156 | unique markets: 366
- Resolved markets (real UMA labels): 65 usable, 282 still open
- Gate-passed markets: resolved 7, still open 18

## Promotion bar: 7 / 200 resolved gate-passed events
Progress: 3.5%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n= 65 | NO-win  80.0% | avg  -14.50% | total   -942.3% | median NO entry 0.986
gate-passed (resolved):  n=  7 | NO-win  85.7% | avg  +23.65% | total   +165.5% | median NO entry 0.710
```

## By asset
```
OIL                    n= 22 | NO-win  72.7% | avg  -22.24% | total   -489.3% | median NO entry 0.962
GOLD                   n= 20 | NO-win  75.0% | avg  -21.76% | total   -435.2% | median NO entry 0.986
BTC                    n= 16 | NO-win  93.8% | avg   +4.82% | total    +77.1% | median NO entry 0.992
ETH                    n=  7 | NO-win  85.7% | avg  -13.55% | total    -94.9% | median NO entry 0.997
```

## By adjusted gap bin (at entry)
```
<0-0                   n= 56 | NO-win  80.4% | avg  -18.35% | total  -1027.6% | median NO entry 0.992
0-4                    n=  4 | NO-win  75.0% | avg   +2.49% | total    +10.0% | median NO entry 0.710
>=12                   n=  3 | NO-win 100.0% | avg  +53.91% | total   +161.7% | median NO entry 0.620
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
4-8                    n=  1 | NO-win 100.0% | avg  +13.64% | total    +13.6% | median NO entry 0.880
```

## By moneyness bucket
```
5-15%                  n= 21 | NO-win  81.0% | avg  -13.37% | total   -280.8% | median NO entry 0.970
>30%                   n= 15 | NO-win 100.0% | avg   +0.21% | total     +3.1% | median NO entry 0.999
<5%                    n= 15 | NO-win  46.7% | avg  -38.60% | total   -579.1% | median NO entry 0.570
15-30%                 n= 14 | NO-win  92.9% | avg   -6.11% | total    -85.5% | median NO entry 0.994
```

## By DTE bucket
```
0-7d                   n= 56 | NO-win  92.9% | avg   -0.76% | total    -42.3% | median NO entry 0.992
31-90d                 n=  8 | NO-win   0.0% | avg -100.00% | total   -800.0% | median NO entry 0.475
8-30d                  n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.800
```

## By contract type / direction
```
touch/above            n= 33 | NO-win  97.0% | avg   +4.31% | total   +142.1% | median NO entry 0.994
touch/below            n= 32 | NO-win  62.5% | avg  -33.89% | total  -1084.4% | median NO entry 0.952
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
