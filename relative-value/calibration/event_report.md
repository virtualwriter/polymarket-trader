# NO-bias calibration: event-level report

- Rows in log: 4761 | unique markets: 529
- Resolved markets (real UMA labels): 327 usable, 163 still open
- Gate-passed markets: resolved 16, still open 12

## Promotion bar: 16 / 200 resolved gate-passed events
Progress: 8.0%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n=327 | NO-win  76.5% | avg   +1.43% | total   +466.6% | median NO entry 0.920
gate-passed (resolved):  n= 16 | NO-win  56.2% | avg  -21.53% | total   -344.5% | median NO entry 0.632
```

## By asset
```
OIL                    n=107 | NO-win  72.9% | avg   +5.88% | total   +629.2% | median NO entry 0.870
GOLD                   n= 86 | NO-win  83.7% | avg   -1.58% | total   -135.6% | median NO entry 0.950
BTC                    n= 67 | NO-win  77.6% | avg   +8.97% | total   +601.3% | median NO entry 0.920
ETH                    n= 57 | NO-win  68.4% | avg  -12.42% | total   -708.0% | median NO entry 0.900
SPY                    n= 10 | NO-win  90.0% | avg   +7.96% | total    +79.6% | median NO entry 0.880
```

## By adjusted gap bin (at entry)
```
<0-0                   n=300 | NO-win  76.7% | avg   +1.78% | total   +533.2% | median NO entry 0.940
0-4                    n= 16 | NO-win  68.8% | avg   -7.68% | total   -122.8% | median NO entry 0.710
>=12                   n=  8 | NO-win  87.5% | avg  +11.93% | total    +95.5% | median NO entry 0.855
4-8                    n=  2 | NO-win 100.0% | avg  +30.35% | total    +60.7% | median NO entry 0.780
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
```

## By moneyness bucket
```
>30%                   n= 94 | NO-win  93.6% | avg   -4.81% | total   -452.1% | median NO entry 0.990
5-15%                  n= 91 | NO-win  81.3% | avg  +16.85% | total  +1533.1% | median NO entry 0.800
15-30%                 n= 78 | NO-win  87.2% | avg  +18.33% | total  +1430.1% | median NO entry 0.960
<5%                    n= 64 | NO-win  31.2% | avg  -31.95% | total  -2044.5% | median NO entry 0.395
```

## By DTE bucket
```
31-90d                 n=158 | NO-win  82.3% | avg   -3.63% | total   -573.8% | median NO entry 0.950
8-30d                  n=100 | NO-win  61.0% | avg  +15.62% | total  +1562.3% | median NO entry 0.670
0-7d                   n= 69 | NO-win  85.5% | avg   -7.56% | total   -522.0% | median NO entry 0.985
```

## By contract type / direction
```
touch/above            n=157 | NO-win  83.4% | avg   +8.12% | total  +1274.5% | median NO entry 0.930
touch/below            n=130 | NO-win  67.7% | avg  -19.41% | total  -2523.5% | median NO entry 0.920
settlement/above       n= 38 | NO-win  76.3% | avg  +45.12% | total  +1714.4% | median NO entry 0.910
settlement/below       n=  2 | NO-win 100.0% | avg   +0.55% | total     +1.1% | median NO entry 0.994
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
