# NO-bias calibration: event-level report

- Rows in log: 111117 | unique markets: 376
- Resolved markets (real UMA labels): 160 usable, 196 still open
- Gate-passed markets: resolved 13, still open 12

## Promotion bar: 13 / 200 resolved gate-passed events
Progress: 6.5%. NO-bias stays shadow-only until the bar is met with positive expectancy.

## Headline cohorts (buy NO at first qualifying snapshot)
```
all resolved markets:    n=160 | NO-win  77.5% | avg   -1.03% | total   -165.3% | median NO entry 0.932
gate-passed (resolved):  n= 13 | NO-win  61.5% | avg  -12.69% | total   -165.0% | median NO entry 0.644
```

## By asset
```
OIL                    n= 48 | NO-win  75.0% | avg  -12.06% | total   -579.1% | median NO entry 0.920
BTC                    n= 41 | NO-win  82.9% | avg  +19.37% | total   +794.1% | median NO entry 0.947
GOLD                   n= 33 | NO-win  69.7% | avg  -13.43% | total   -443.3% | median NO entry 0.930
ETH                    n= 28 | NO-win  78.6% | avg   -0.59% | total    -16.6% | median NO entry 0.964
SPY                    n= 10 | NO-win  90.0% | avg   +7.96% | total    +79.6% | median NO entry 0.880
```

## By adjusted gap bin (at entry)
```
<0-0                   n=147 | NO-win  78.2% | avg   -0.74% | total   -108.8% | median NO entry 0.950
0-4                    n=  7 | NO-win  57.1% | avg  -25.56% | total   -178.9% | median NO entry 0.720
>=12                   n=  3 | NO-win 100.0% | avg  +53.91% | total   +161.7% | median NO entry 0.620
4-8                    n=  2 | NO-win 100.0% | avg  +30.35% | total    +60.7% | median NO entry 0.780
8-12                   n=  1 | NO-win   0.0% | avg -100.00% | total   -100.0% | median NO entry 0.530
```

## By moneyness bucket
```
5-15%                  n= 55 | NO-win  76.4% | avg   +5.32% | total   +292.8% | median NO entry 0.820
>30%                   n= 39 | NO-win 100.0% | avg   +1.74% | total    +67.8% | median NO entry 0.991
15-30%                 n= 35 | NO-win  82.9% | avg  -12.78% | total   -447.2% | median NO entry 0.964
<5%                    n= 31 | NO-win  45.2% | avg   -2.54% | total    -78.7% | median NO entry 0.470
```

## By DTE bucket
```
8-30d                  n= 68 | NO-win  70.6% | avg   +9.83% | total   +668.6% | median NO entry 0.850
0-7d                   n= 58 | NO-win  93.1% | avg   +0.27% | total    +15.9% | median NO entry 0.991
31-90d                 n= 34 | NO-win  64.7% | avg  -24.99% | total   -849.8% | median NO entry 0.860
```

## By contract type / direction
```
touch/above            n= 85 | NO-win  94.1% | avg  +31.66% | total  +2690.8% | median NO entry 0.934
touch/below            n= 75 | NO-win  58.7% | avg  -38.08% | total  -2856.1% | median NO entry 0.930
```

## Reading guide
- One observation per market (entry at first snapshot); hourly rows are NOT independent evidence.
- Win rates at NO entry > 0.95 are base rate, not edge; check avg return instead.
- Buy-NO return: NO resolves -> (1-entry)/entry, YES resolves -> -100%.
