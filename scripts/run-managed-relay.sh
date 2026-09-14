#!/bin/sh
set -eu

DATA_DIR=${AGENTDECK_DATA_DIR:-"$HOME/.local/share/agentdeck"}
STATE_DIR=${AGENTDECK_STATE_DIR:-"$HOME/.local/state/agentdeck"}
CONFIG_DIR=${AGENTDECK_CONFIG_DIR:-"${XDG_CONFIG_HOME:-$HOME/.config}/agentdeck"}
VENV_DIR="$DATA_DIR/venv"
CLOUDFLARED="$DATA_DIR/bin/cloudflared"
PORT=${AGENTDECK_PUBLIC_PORT:-8765}
URL_FILE="$STATE_DIR/public-url"
TUNNEL_LOG="$STATE_DIR/cloudflared.log"
DATABASE_FILE="$STATE_DIR/relay.db"
SECRET_FILE="$STATE_DIR/relay-secret"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
rm -f "$URL_FILE"
: > "$TUNNEL_LOG"

RELAY_PID=
TUNNEL_PID=
DAEMON_PID=
cleanup() {
  [ -z "$DAEMON_PID" ] || kill "$DAEMON_PID" 2>/dev/null || true
  [ -z "$TUNNEL_PID" ] || kill "$TUNNEL_PID" 2>/dev/null || true
  [ -z "$RELAY_PID" ] || kill "$RELAY_PID" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

AGENTDECK_ENVIRONMENT=development \
AGENTDECK_DATABASE_URL="sqlite+aiosqlite:///$DATABASE_FILE" \
AGENTDECK_JWT_SECRET="$(sed -n '1p' "$SECRET_FILE")" \
  "$VENV_DIR/bin/uvicorn" server.app.main:app --host 127.0.0.1 --port "$PORT" &
RELAY_PID=$!

attempt=0
until "$VENV_DIR/bin/python" -c \
  "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$PORT/health/ready', timeout=2)" \
  >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ] || ! kill -0 "$RELAY_PID" 2>/dev/null; then
    echo "AgentDeck relay failed to start." >&2
    exit 1
  fi
  sleep 1
done

"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" \
  >>"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

attempt=0
PUBLIC_URL=
while [ -z "$PUBLIC_URL" ]; do
  PUBLIC_URL=$(sed -n 's|.*\(https://[-a-z0-9]*\.trycloudflare\.com\).*|\1|p' "$TUNNEL_LOG" | head -n 1)
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ] || ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Cloudflare Tunnel failed to start. See $TUNNEL_LOG" >&2
    exit 1
  fi
  [ -n "$PUBLIC_URL" ] || sleep 1
done

# A Quick Tunnel prints its hostname before the public DNS record and route are
# necessarily usable. Do not publish the URL to the installer until the same
# HTTPS endpoint used by the phone is actually reachable.
attempt=0
until "$VENV_DIR/bin/python" -c \
  "import urllib.request; urllib.request.urlopen('$PUBLIC_URL/health/ready', timeout=5)" \
  >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 180 ] || ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Quick Tunnel URL did not become reachable: $PUBLIC_URL" >&2
    exit 1
  fi
  sleep 1
done

printf '%s\n' "$PUBLIC_URL" > "$URL_FILE"
chmod 600 "$URL_FILE"

# Quick Tunnel URLs change after a restart. Keep the already registered laptop
# pointed at the newly issued URL before its daemon reconnects.
if [ -f "$CONFIG_DIR/config.json" ]; then
  AGENTDECK_CONFIG_DIR="$CONFIG_DIR" AGENTDECK_NEW_URL="$PUBLIC_URL" \
    "$VENV_DIR/bin/python" - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["AGENTDECK_CONFIG_DIR"]) / "config.json"
data = json.loads(path.read_text())
data["server_url"] = os.environ["AGENTDECK_NEW_URL"]
temporary = path.with_suffix(".tmp")
temporary.write_text(json.dumps(data, indent=2))
temporary.chmod(0o600)
temporary.replace(path)
PY
fi

echo "AgentDeck URL: $PUBLIC_URL"
while kill -0 "$TUNNEL_PID" 2>/dev/null && kill -0 "$RELAY_PID" 2>/dev/null; do
  if [ -z "$DAEMON_PID" ] && [ -s "$CONFIG_DIR/credential" ]; then
    "$VENV_DIR/bin/agentdeck" daemon &
    DAEMON_PID=$!
  elif [ -n "$DAEMON_PID" ] && ! kill -0 "$DAEMON_PID" 2>/dev/null; then
    wait "$DAEMON_PID" 2>/dev/null || true
    DAEMON_PID=
  fi
  sleep 2
done

echo "AgentDeck relay or tunnel stopped unexpectedly." >&2
exit 1
