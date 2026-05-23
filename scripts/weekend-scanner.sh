#!/bin/bash
# Weekend scanner for all US equity perps on Hyperliquid Builder DEX
# Runs every 5 minutes, appends to a CSV with ALL stocks' funding
# Usage: nohup bash scripts/weekend-scanner.sh &

OUTFILE="data/weekend-funding-snapshot.csv"
INTERVAL=300  # 5 minutes

echo "Starting weekend scanner at $(date -u)"
echo "Logging to $OUTFILE"

# Create header if file doesn't exist
if [ ! -f "$OUTFILE" ]; then
  echo "Creating header..."
  python3 -c "
import requests
resp = requests.post('https://api.hyperliquid.xyz/info', json={'type':'metaAndAssetCtxs','dex':'xyz'}, timeout=10)
meta = resp.json()[0]
# US stocks only
exclude = {'EUR','JPY','GBP','KRW','GOLD','SILVER','PLATINUM','PALLADIUM','CL','COPPER','NATGAS','CORN','WHEAT','BRENTOIL','URANIUM','ALUMINIUM','XYZ100','SP500','SPCX','JP225','NIFTY','DXY','VIX','TTF','VOL','H100','DRAM','PURRDAT','CRWV','USAR','EWY','EWJ','EWT','EWZ','XLE','URNM','KR200','IBOV','HYUNDAI','SOFTBANK','KIOXIA','SMSN','ASML'}
names = []
for u in meta['universe']:
    name = u['name'].replace('xyz:','')
    if name not in exclude:
        names.append(name)
names.sort()
header = 'timestamp_utc,' + ','.join([f'{n}_funding_ann,{n}_mark_px' for n in names])
print(header)
"
fi

COUNTER=0
while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")
  
  python3 -c "
import requests, sys
resp = requests.post('https://api.hyperliquid.xyz/info', json={'type':'metaAndAssetCtxs','dex':'xyz'}, timeout=10)
meta = resp.json()[0]
ctxs = resp.json()[1]

exclude = {'EUR','JPY','GBP','KRW','GOLD','SILVER','PLATINUM','PALLADIUM','CL','COPPER','NATGAS','CORN','WHEAT','BRENTOIL','URANIUM','ALUMINIUM','XYZ100','SP500','SPCX','JP225','NIFTY','DXY','VIX','TTF','VOL','H100','DRAM','PURRDAT','CRWV','USAR','EWY','EWJ','EWT','EWZ','XLE','URNM','KR200','IBOV','HYUNDAI','SOFTBANK','KIOXIA','SMSN','ASML'}

name_data = {}
for i, u in enumerate(meta['universe']):
    name = u['name'].replace('xyz:','')
    if name not in exclude:
        ctx = ctxs[i]
        funding_ann = float(ctx['funding']) * 24 * 365 * 100
        mark_px = float(ctx['markPx'])
        name_data[name] = (funding_ann, mark_px)

names = sorted(name_data.keys())
row = '$TIMESTAMP'
for n in names:
    fund, px = name_data[n]
    row += f',{fund:.4f},{px:.4f}'
print(row)
" | head -1 >> "$OUTFILE"
  
  COUNTER=$((COUNTER + 1))
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] Snapshot #$COUNTER written ($(wc -l < "$OUTFILE") rows total)"
  sleep $INTERVAL
done
