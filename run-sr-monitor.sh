#!/bin/bash
# Persistent Sportradar monitor — runs alongside the sim without affecting it.
# Logs Sportradar game events + CLOB snapshots to the same logs/ folder.
#
# Usage:
#   ./run-sr-monitor.sh        # start
#   ./run-sr-monitor.sh stop   # stop
#   ./run-sr-monitor.sh status # check

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs"
PID_FILE="$LOGS_DIR/sr-monitor.pid"
SESSION_ID=$(date +%Y-%m-%dT%H-%M-%S)

mkdir -p "$LOGS_DIR"

stop_monitor() {
  if [ -f "$PID_FILE" ]; then
    CAFE_PID=$(cat "$PID_FILE")
    echo "Stopping SR monitor (caffeinate PID $CAFE_PID and children)..."
    pkill -P "$CAFE_PID" 2>/dev/null
    kill "$CAFE_PID" 2>/dev/null
    rm -f "$PID_FILE"
    echo "Stopped."
  else
    echo "No running SR monitor found."
  fi
}

status_monitor() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "SR Monitor is RUNNING (PID $PID)"
      echo ""
      echo "Latest monitor log:"
      ls -lh "$LOGS_DIR"/sr-console-*.log 2>/dev/null | tail -2
      echo ""
      tail -20 "$LOGS_DIR"/sr-console-*.log 2>/dev/null
      echo ""
      echo "Data files:"
      ls -lh "$LOGS_DIR"/sr-monitor-*.jsonl 2>/dev/null | tail -2
      echo ""
      LATEST=$(ls -t "$LOGS_DIR"/sr-monitor-*.jsonl 2>/dev/null | head -1)
      if [ -n "$LATEST" ]; then
        LINES=$(wc -l < "$LATEST")
        echo "Events logged: $LINES"
      fi
    else
      echo "SR Monitor PID $PID is not running (stale pidfile)."
      rm -f "$PID_FILE"
    fi
  else
    echo "No running SR monitor found."
  fi
}

case "${1:-start}" in
  stop)
    stop_monitor
    exit 0
    ;;
  status)
    status_monitor
    exit 0
    ;;
  start)
    ;;
  *)
    echo "Usage: $0 [start|stop|status]"
    exit 1
    ;;
esac

stop_monitor 2>/dev/null
sleep 1

CONSOLE_LOG="$LOGS_DIR/sr-console-$SESSION_ID.log"

echo "=========================================="
echo " Sportradar Live Monitor"
echo "=========================================="
echo " Session:     $SESSION_ID"
echo " Console log: $CONSOLE_LOG"
echo " Data:        $LOGS_DIR/sr-monitor-*.jsonl"
echo "=========================================="
echo ""

cd "$SCRIPT_DIR"

nohup caffeinate -s bash -c "
  cd '$SCRIPT_DIR'
  npx tsx scripts/sportradar-monitor.ts >> '$CONSOLE_LOG' 2>&1
" > /dev/null 2>&1 &

CAFE_PID=$!
echo "$CAFE_PID" > "$PID_FILE"

sleep 8

echo "SR Monitor is running in background (PID $CAFE_PID)."
echo ""
echo "Commands:"
echo "  ./run-sr-monitor.sh status  — check status & tail logs"
echo "  ./run-sr-monitor.sh stop    — stop"
echo ""
echo "Monitor live:"
echo "  tail -f $CONSOLE_LOG"
echo ""
echo "Data file (JSONL):"
LATEST=$(ls -t "$LOGS_DIR"/sr-monitor-*.jsonl 2>/dev/null | head -1)
echo "  $LATEST"
echo ""
echo "Your Mac will NOT sleep while the monitor is running."
