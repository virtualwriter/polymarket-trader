#!/bin/bash
# Polls ESPN every 10s and sends score updates to the mean-reversion bot
SERVER="http://localhost:8082"
MARKET_ID="cbb-pur-ucla-2026-03-14-moneyline"
LAST_SCORE=""

while true; do
  DATA=$(curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260314" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for e in d.get('events', []):
    if 'purdue' in e.get('name','').lower():
        comp = e['competitions'][0]
        period = comp.get('status',{}).get('period', 0)
        clock = comp.get('status',{}).get('displayClock', '0:00')
        status = comp.get('status',{}).get('type',{}).get('name','')
        halftime = 'true' if status == 'STATUS_HALFTIME' else 'false'
        ended = 'true' if status == 'STATUS_FINAL' else 'false'
        scores = {}
        for t in comp.get('competitors',[]):
            ha = t.get('homeAway','')
            scores[ha] = int(t.get('score','0'))
        away = scores.get('away', 0)
        home = scores.get('home', 0)
        # seconds remaining estimate
        if ':' in clock:
            parts = clock.split(':')
            secs = int(parts[0])*60 + int(parts[1])
        else:
            secs = 0
        print(f'{away}|{home}|{period}|{clock}|{secs}|{halftime}|{ended}')
" 2>/dev/null)

  if [ -n "$DATA" ]; then
    IFS='|' read -r AWAY HOME PERIOD CLOCK SECS HALFTIME ENDED <<< "$DATA"
    SCORE_KEY="${AWAY}-${HOME}"
    
    if [ "$ENDED" = "true" ]; then
      echo "[ESPN] GAME ENDED: Purdue $AWAY - UCLA $HOME"
      curl -s -X POST "$SERVER/game-event" -H 'Content-Type: application/json' -d "{
        \"marketId\": \"$MARKET_ID\",
        \"eventType\": \"game_end\",
        \"data\": {\"teamAWins\": $([ "$AWAY" -gt "$HOME" ] && echo true || echo false), \"source\": \"espn\"}
      }" > /dev/null
      exit 0
    fi

    EVENT_TYPE="score_update"
    if [ -n "$LAST_SCORE" ] && [ "$LAST_SCORE" != "$SCORE_KEY" ]; then
      EVENT_TYPE="score_change"
      echo "[ESPN] SCORE CHANGE: $LAST_SCORE → $SCORE_KEY (P${PERIOD} ${CLOCK})"
    fi

    curl -s -X POST "$SERVER/game-event" -H 'Content-Type: application/json' -d "{
      \"marketId\": \"$MARKET_ID\",
      \"eventType\": \"$EVENT_TYPE\",
      \"data\": {
        \"scoreA\": $AWAY,
        \"scoreB\": $HOME,
        \"quarter\": $PERIOD,
        \"clock\": \"$CLOCK\",
        \"secondsRemaining\": $SECS,
        \"isHalftime\": $HALFTIME,
        \"prevScore\": \"$LAST_SCORE\",
        \"newScore\": \"$SCORE_KEY\",
        \"source\": \"espn\"
      }
    }" > /dev/null

    LAST_SCORE="$SCORE_KEY"
    echo "[ESPN] Purdue $AWAY - UCLA $HOME | H${PERIOD} ${CLOCK} | ${EVENT_TYPE}"
  fi

  sleep 10
done
