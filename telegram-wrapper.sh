#!/bin/bash
# Wrapper script for pi-telegram bridge (v5)
# - /new signal: purge session, start fresh
# - maphim/pi-telegram fork has /restart built-in
# - systemd Restart=always handles restart loop

PI_DIR="/media/anhnc/Data/Workspace/brain"
NVM_NODE="/home/anhnc/.nvm/versions/node/v22.22.2"
PI_BIN="$NVM_NODE/bin/pi"
LOCK_FILE="/home/anhnc/.pi/agent/locks.json"
LOG_FILE="/tmp/pi-telegram-bridge.log"
DEBUG_LOG="/tmp/pi-telegram-debug.log"
SIGNAL_FILE="/tmp/pi-force-new-session"
# pi stores sessions in .pi/sessions relative to project dir (from settings.json)
SESSION_DIR="$PI_DIR/.pi/sessions"
PATCH_SCRIPT="/home/anhnc/.pi/patch-telegram-restart.mjs"

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

# ── maphim/pi-telegram has /restart built-in (no patch needed) ──
"$NVM_NODE/bin/node" "$PATCH_SCRIPT" 2>/dev/null && echo "[$(ts)] PATCH: /restart applied (maphim fork already has it — skipping)" >>"$DEBUG_LOG"

# ── Read restart marker (silent — no startup spam) ──
RESTART_MARKER_JSON="/tmp/pi-telegram-restart-marker.json"
RESTART_MARKER="/tmp/pi-telegram-restart-marker"
if [ -f "$RESTART_MARKER_JSON" ]; then
  COST=$(python3 -c "import json; d=json.load(open('$RESTART_MARKER_JSON')); print(d.get('cost','?.????'))" 2>/dev/null)
  TOKENS_IN=$(python3 -c "import json; d=json.load(open('$RESTART_MARKER_JSON')); print(d.get('tokensIn',0))" 2>/dev/null)
  TOKENS_OUT=$(python3 -c "import json; d=json.load(open('$RESTART_MARKER_JSON')); print(d.get('tokensOut',0))" 2>/dev/null)
  TURNS=$(python3 -c "import json; d=json.load(open('$RESTART_MARKER_JSON')); print(d.get('turns',0))" 2>/dev/null)
  echo "[$(ts)] STARTUP: prev \$${COST} | ${TOKENS_IN}↓${TOKENS_OUT}↑ | ${TURNS}turns (silent)" >>"$DEBUG_LOG"
  rm -f "$RESTART_MARKER_JSON" "$RESTART_MARKER"
fi

# ── trap for graceful shutdown ────────────────────────────
cleanup() {
	local exit_code=$?
	echo "[$(ts)] EXIT code=$exit_code — $(kill -l $exit_code 2>/dev/null || echo 'normal')" >>"$DEBUG_LOG"
	rm -f "$LOCK_FILE"
	exit $exit_code
}
trap cleanup EXIT TERM INT

# Default: -c (continue/resume). On /new signal: purge + fresh start.
# rm -rf ensures ALL old files gone → -c creates new session (cost = $0)
PI_FLAGS="-c"
RESET_FILE="/tmp/pi-telegram-cost-zero"
if [ -f "$SIGNAL_FILE" ]; then
	echo "[$(ts)] /new signal detected — purging session, fresh start" >>"$DEBUG_LOG"
	rm -rf "$SESSION_DIR"
	mkdir -p "$SESSION_DIR"
	touch "$RESET_FILE"
	rm -f "$SIGNAL_FILE"
fi

# Clean up old state
rm -f "$LOCK_FILE"
echo "[$(ts)] START (pid=$$) flags=$PI_FLAGS" >>"$DEBUG_LOG"

# Create stale lock so extension auto-connects
echo '{"@llblab/pi-telegram":{"pid":0,"cwd":"'"$PI_DIR"'"}}' >"$LOCK_FILE"

# Wait for project dir (handle mount delay on boot)
RETRIES=30
while [ ! -d "$PI_DIR" ] && [ $RETRIES -gt 0 ]; do
	sleep 2
	RETRIES=$((RETRIES - 1))
done
if [ ! -d "$PI_DIR" ]; then
	echo "[$(ts)] FATAL: $PI_DIR not found after 60s" >>"$DEBUG_LOG"
	exit 1
fi
cd "$PI_DIR"
export PATH="$NVM_NODE/bin:$PATH"
export NODE_ENV=production
export PI_SKIP_VERSION_CHECK=1

# ── heartbeat for watchdog (touch every 60s while bridge is alive) ──
HEARTBEAT="/tmp/pi-telegram-heartbeat"
touch "$HEARTBEAT"
(
  while true; do
    sleep 60
    touch "$HEARTBEAT" 2>/dev/null || exit 0
  done
) &
HEARTBEAT_PID=$!
cleanup_heartbeat() { kill $HEARTBEAT_PID 2>/dev/null; rm -f "$HEARTBEAT"; }
trap cleanup_heartbeat EXIT TERM INT

# ── run pi under script (fake PTY for headless mode) ──
/usr/bin/script -q -c "$PI_BIN $PI_FLAGS" "$LOG_FILE" >/dev/null 2>&1
SCRIPT_EXIT=$?
echo "[$(ts)] pi exited (code=$SCRIPT_EXIT)" >>"$DEBUG_LOG"
cleanup_heartbeat
exit $SCRIPT_EXIT
