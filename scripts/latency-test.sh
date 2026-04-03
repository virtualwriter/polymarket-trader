#!/bin/bash
# Latency test: Polymarket price vs ESPN score updates
# Polls both every 2 seconds, logs when either changes

YES_TOKEN="3790277659254307751654533297196036110230237333900259548753030646222659599414"
LAST_ESPN_SCORE=""
LAST_PM_MID=""
LOG_FILE="/tmp/latency-test.log"

echo "=== LATENCY TEST: Polymarket vs ESPN ===" | tee $LOG_FILE
echo "Polling both every 2s. Watching for changes..." | tee -a $LOG_FILE
echo "" | tee -a $LOG_FILE

while true; do
  TS=$(python3 -c "import time; print(f'{time.time():.3f}')")
  HUMAN_TS=$(date '+%H:%M:%S')

  # Poll both in parallel
  ESPN_RAW=$(curl -s --max-time 2 "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260314" 2>/dev/null)
  PM_RAW=$(curl -s --max-time 2 "https://clob.polymarket.com/midpoint?token_id=$YES_TOKEN" 2>/dev/null)

  # Parse ESPN
  ESPN_DATA=$(echo "$ESPN_RAW" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for e in d.get('events', []):
        if 'purdue' in e.get('name','').lower():
            comp = e['competitions'][0]
            period = comp.get('status',{}).get('period', 0)
            clock = comp.get('status',{}).get('displayClock', '?')
            status = comp.get('status',{}).get('type',{}).get('name','')
            scores = {}
            for t in comp.get('competitors',[]):
                ha = t.get('homeAway','')
                scores[ha] = t.get('score','0')
            print(f'{scores.get(\"away\",\"?\")}-{scores.get(\"home\",\"?\")}|{period}|{clock}|{status}')
except:
    print('ERR')
" 2>/dev/null)

  # Parse Polymarket
  PM_MID=$(echo "$PM_RAW" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('mid', 'ERR'))
except:
    print('ERR')
" 2>/dev/null)

  if [ "$ESPN_DATA" = "ERR" ] || [ "$PM_MID" = "ERR" ]; then
    sleep 2
    continue
  fi

  ESPN_SCORE=$(echo "$ESPN_DATA" | cut -d'|' -f1)
  ESPN_PERIOD=$(echo "$ESPN_DATA" | cut -d'|' -f2)
  ESPN_CLOCK=$(echo "$ESPN_DATA" | cut -d'|' -f3)
  ESPN_STATUS=$(echo "$ESPN_DATA" | cut -d'|' -f4)

  # Detect changes
  PM_CHANGED=""
  ESPN_CHANGED=""

  if [ -n "$LAST_PM_MID" ] && [ "$PM_MID" != "$LAST_PM_MID" ]; then
    PM_CHANGED="YES"
    echo "[$HUMAN_TS] ⚡ POLYMARKET MOVED: $LAST_PM_MID → $PM_MID (UCLA: $(python3 -c "print(f'{(1-float(\"$PM_MID\"))*100:.1f}¢')"))" | tee -a $LOG_FILE
  fi

  if [ -n "$LAST_ESPN_SCORE" ] && [ "$ESPN_SCORE" != "$LAST_ESPN_SCORE" ]; then
    ESPN_CHANGED="YES"
    echo "[$HUMAN_TS] 📺 ESPN SCORE CHANGE: $LAST_ESPN_SCORE → $ESPN_SCORE (H${ESPN_PERIOD} ${ESPN_CLOCK})" | tee -a $LOG_FILE
  fi

  # Periodic status line every 15 iterations (~30s)
  if [ -z "$PM_CHANGED" ] && [ -z "$ESPN_CHANGED" ]; then
    TICK=$((${TICK:-0} + 1))
    if [ $((TICK % 15)) -eq 0 ]; then
      echo "[$HUMAN_TS] ... PM=${PM_MID} (UCLA $(python3 -c "print(f'{(1-float(\"$PM_MID\"))*100:.1f}¢')")) | ESPN=${ESPN_SCORE} H${ESPN_PERIOD} ${ESPN_CLOCK} ${ESPN_STATUS}" | tee -a $LOG_FILE
    fi
  fi

  LAST_PM_MID="$PM_MID"
  LAST_ESPN_SCORE="$ESPN_SCORE"

  sleep 2
done
