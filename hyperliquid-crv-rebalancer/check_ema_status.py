import json, time
from urllib.request import urlopen, Request

def post(url, payload):
    req = Request(url, data=json.dumps(payload).encode(),
                  headers={"Content-Type": "application/json"})
    return json.loads(urlopen(req, timeout=15).read())

def ema(p, prd):
    if len(p) < prd:
        return None
    k = 2.0 / (prd + 1)
    e = sum(p[:prd]) / prd
    for v in p[prd:]:
        e = v * k + e * (1 - k)
    return e

COINS = ["ADA", "APT", "ARB", "ATOM", "AVAX", "BCH",
         "CRV", "DOT", "FARTCOIN", "INJ", "OP", "TRUMP"]
now = int(time.time() * 1000)
start = now - 200 * 3600 * 1000
mids = post("https://api.hyperliquid.xyz/info", {"type": "allMids"})

for c in COINS:
    try:
        candles = post("https://api.hyperliquid.xyz/info", {
            "type": "candleSnapshot",
            "req": {"coin": c, "interval": "1h",
                    "startTime": start, "endTime": now},
        })
        prices = [float(x["c"]) for x in candles]
        price = float(mids.get(c, prices[-1]))
        e3 = ema(prices, 3)
        d3 = (price / e3 - 1) * 100
        if d3 < -0.5:
            note = "YES - SHORTABLE"
        else:
            note = "no (needs %.2f%% more drop)" % (d3 + 0.5)
        print("  %-10s  $%-8.4f  d3h=%+.2f%%  %s" % (c, price, d3, note))
    except Exception as ex:
        print("  %-10s  ERROR: %s" % (c, ex))
