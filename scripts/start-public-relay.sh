#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PORT=${AGENTDECK_PUBLIC_PORT:-8765}
STATE_DIR=${AGENTDECK_PUBLIC_STATE_DIR:-"$HOME/.local/state/agentdeck"}
SECRET_FILE="$STATE_DIR/relay-secret"
DATABASE_FILE="$STATE_DIR/relay.db"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to install Cloudflare Tunnel and verify the relay."
  exit 1
fi
if [ ! -x "$PROJECT_DIR/.venv/bin/uvicorn" ]; then
  echo "AgentDeck's Python environment is missing. Run this first:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'"
  exit 1
fi

if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED=$(command -v cloudflared)
else
  CLOUDFLARED="$PROJECT_DIR/.tools/cloudflared"
  if [ ! -x "$CLOUDFLARED" ]; then
    case "$(uname -m)" in
      x86_64|amd64) CF_ARCH=amd64 ;;
      aarch64|arm64) CF_ARCH=arm64 ;;
      *) echo "Unsupported CPU architecture: $(uname -m)"; exit 1 ;;
    esac
    echo "Downloading the official Cloudflare Tunnel client..."
    mkdir -p "$PROJECT_DIR/.tools"
    DOWNLOAD=$(mktemp "${TMPDIR:-/tmp}/cloudflared.XXXXXX")
    curl -fL --retry 3 \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" \
      -o "$DOWNLOAD"
    chmod 755 "$DOWNLOAD"
    "$DOWNLOAD" --version >/dev/null
    mv "$DOWNLOAD" "$CLOUDFLARED"
  fi
fi

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
if [ ! -s "$SECRET_FILE" ]; then
  umask 077
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 > "$SECRET_FILE"
  else
    dd if=/dev/urandom bs=32 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n' > "$SECRET_FILE"
  fi
fi

TUNNEL_LOG=$(mktemp "${TMPDIR:-/tmp}/agentdeck-tunnel.XXXXXX")
RELAY_PID=
TUNNEL_PID=
cleanup() {
  [ -z "$TUNNEL_PID" ] || kill "$TUNNEL_PID" 2>/dev/null || true
  [ -z "$RELAY_PID" ] || kill "$RELAY_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT HUP INT TERM

cd "$PROJECT_DIR"
AGENTDECK_ENVIRONMENT=development \
AGENTDECK_DATABASE_URL="sqlite+aiosqlite:///$DATABASE_FILE" \
AGENTDECK_JWT_SECRET="$(sed -n '1p' "$SECRET_FILE")" \
  .venv/bin/uvicorn server.app.main:app --host 127.0.0.1 --port "$PORT" &
RELAY_PID=$!

attempt=0
until curl -fsS "http://127.0.0.1:$PORT/health/ready" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ] || ! kill -0 "$RELAY_PID" 2>/dev/null; then
    echo "The AgentDeck relay did not start."
    exit 1
  fi
  sleep 1
done

"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
attempt=0
PUBLIC_URL=
while [ -z "$PUBLIC_URL" ]; do
  PUBLIC_URL=$(sed -n 's|.*\(https://[-a-z0-9]*\.trycloudflare\.com\).*|\1|p' "$TUNNEL_LOG" | head -n 1)
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 45 ] || ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Cloudflare Tunnel did not start:"
    sed -n '1,120p' "$TUNNEL_LOG"
    exit 1
  fi
  [ -n "$PUBLIC_URL" ] || sleep 1
done

echo
echo "AgentDeck is publicly available at:"
echo "  $PUBLIC_URL"
echo
echo "Use this exact URL on your phone and both laptops."
echo "On each additional laptop, from the AgentDeck project, run:"
echo "  ./scripts/connect-laptop.sh $PUBLIC_URL ~/Documents"
echo
echo "Keep this terminal and relay laptop running. Press Ctrl+C to stop."
wait "$TUNNEL_PID"
