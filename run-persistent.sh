#!/bin/bash
# Persistent simulation runner — survives terminal close and prevents Mac sleep
# Logs all output to sports-mm/logs/ for post-session analysis
#
# Usage:
#   ./run-persistent.sh        # start
#   ./run-persistent.sh stop   # stop
#   ./run-persistent.sh status # check

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs"
PID_FILE="$LOGS_DIR/sim.pid"
SESSION_ID=$(date +%Y-%m-%dT%H-%M-%S)

mkdir -p "$LOGS_DIR"

stop_sim() {
  if [ -f "$PID_FILE" ]; then
    CAFE_PID=$(cat "$PID_FILE")
    echo "Stopping simulation (caffeinate PID $CAFE_PID and children)..."
    pkill -P "$CAFE_PID" 2>/dev/null
    kill "$CAFE_PID" 2>/dev/null
    rm -f "$PID_FILE"
    lsof -ti :8080 | xargs kill -9 2>/dev/null
    echo "Stopped."
  else
    echo "No running simulation found."
    lsof -ti :8080 | xargs kill -9 2>/dev/null
  fi
}

status_sim() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Simulation is RUNNING (PID $PID)"
      echo ""
      echo "Log files in $LOGS_DIR:"
      ls -lh "$LOGS_DIR"/*.log 2>/dev/null | tail -4
      echo ""
      echo "Latest server output:"
      tail -20 "$LOGS_DIR"/server-*.log 2>/dev/null
      echo ""
      echo "Data files:"
      ls -lh "$LOGS_DIR"/events-*.jsonl "$LOGS_DIR"/snapshots-*.jsonl 2>/dev/null
    else
      echo "Simulation PID $PID is not running (stale pidfile)."
      rm -f "$PID_FILE"
    fi
  else
    echo "No running simulation found."
  fi
}

case "${1:-start}" in
  stop)
    stop_sim
    exit 0
    ;;
  status)
    status_sim
    exit 0
    ;;
  start)
    ;;
  *)
    echo "Usage: $0 [start|stop|status]"
    exit 1
    ;;
esac

# Kill any existing instance
stop_sim 2>/dev/null
sleep 1

SERVER_LOG="$LOGS_DIR/server-$SESSION_ID.log"
BRIDGE_LOG="$LOGS_DIR/bridge-$SESSION_ID.log"
TRACKER_LOG="$LOGS_DIR/tracker-$SESSION_ID.log"

echo "=========================================="
echo " Sports MM — Persistent Simulation"
echo "=========================================="
echo " Session:   $SESSION_ID"
echo " Server:    $SERVER_LOG"
echo " Bridge:    $BRIDGE_LOG"
echo " Tracker:   $TRACKER_LOG"
echo " Data:      $LOGS_DIR/events-*.jsonl"
echo "            $LOGS_DIR/snapshots-*.jsonl"
echo "=========================================="
echo ""
echo "Starting sim server..."

cd "$SCRIPT_DIR"

# caffeinate -s prevents system sleep while this process tree is alive.
# nohup makes it survive terminal close.
# We run the three processes sequentially with proper startup delays.
nohup caffeinate -s bash -c "
  cd '$SCRIPT_DIR'

  # 1) Start the sim server
  npx tsx scripts/sports-sim-server.ts >> '$SERVER_LOG' 2>&1 &
  SERVER_PID=\$!
  echo \"Server PID: \$SERVER_PID\" >> '$SERVER_LOG'
  sleep 5

  # 2) Start the Polymarket live bridge
  npx tsx scripts/sports-bridge.ts --source polymarket-live >> '$BRIDGE_LOG' 2>&1 &
  BRIDGE_PID=\$!
  echo \"Bridge PID: \$BRIDGE_PID\" >> '$BRIDGE_LOG'
  sleep 3

  # 3) Start the performance tracker
  npx tsx scripts/performance-tracker.ts >> '$TRACKER_LOG' 2>&1 &
  TRACKER_PID=\$!
  echo \"Tracker PID: \$TRACKER_PID\" >> '$TRACKER_LOG'

  echo \"All processes started: server=\$SERVER_PID bridge=\$BRIDGE_PID tracker=\$TRACKER_PID\"

  # Wait for all — if any exits, keep the others running
  wait \$SERVER_PID \$BRIDGE_PID \$TRACKER_PID
" > /dev/null 2>&1 &

CAFE_PID=$!
echo "$CAFE_PID" > "$PID_FILE"

sleep 6

echo "Sim is running in background (PID $CAFE_PID)."
echo ""
echo "Commands:"
echo "  ./run-persistent.sh status  — check status & tail logs"
echo "  ./run-persistent.sh stop    — stop all processes"
echo ""
echo "Monitor live:"
echo "  tail -f $SERVER_LOG"
echo "  tail -f $BRIDGE_LOG"
echo ""
echo "The JSONL training data accumulates in:"
echo "  $LOGS_DIR/events-*.jsonl   (every fill, odds update, game event)"
echo "  $LOGS_DIR/snapshots-*.jsonl (full state every ~30s)"
echo ""
echo "Your Mac will NOT sleep while the sim is running (caffeinate -s)."
