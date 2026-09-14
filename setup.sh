#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DATA_DIR="$HOME/.local/share/agentdeck"
STATE_DIR="$HOME/.local/state/agentdeck"
LIB_DIR="$HOME/.local/lib/agentdeck"
BIN_DIR="$DATA_DIR/bin"
SERVICE_DIR="$HOME/.config/systemd/user"
URL_FILE="$STATE_DIR/public-url"

fail() { echo "Error: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "Python 3.10 or newer is required."
command -v systemctl >/dev/null 2>&1 || fail "This installer requires Linux with systemd."
command -v curl >/dev/null 2>&1 || fail "curl is required."
python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' || fail "Python 3.10 or newer is required."

printf 'Account email: '
IFS= read -r EMAIL
[ -n "$EMAIL" ] || fail "Email cannot be empty."
printf 'Account password (12+ characters): '
trap 'stty echo 2>/dev/null || true' EXIT HUP INT TERM
stty -echo
IFS= read -r PASSWORD
stty echo
trap - EXIT HUP INT TERM
printf '\n'
[ "${#PASSWORD}" -ge 12 ] || fail "Password must have at least 12 characters."
printf 'Laptop name [%s]: ' "$(hostname)"
IFS= read -r DEVICE_NAME
DEVICE_NAME=${DEVICE_NAME:-$(hostname)}
printf 'Folder containing your Git projects [%s]: ' "$HOME/Documents"
IFS= read -r REPOSITORY_ROOT
REPOSITORY_ROOT=${REPOSITORY_ROOT:-"$HOME/Documents"}
[ -d "$REPOSITORY_ROOT" ] || fail "Repository folder does not exist: $REPOSITORY_ROOT"

echo "Installing AgentDeck..."
mkdir -p "$DATA_DIR" "$STATE_DIR" "$LIB_DIR" "$BIN_DIR" "$SERVICE_DIR" "$HOME/.local/bin"
chmod 700 "$DATA_DIR" "$STATE_DIR"
python3 -m venv "$DATA_DIR/venv"
"$DATA_DIR/venv/bin/pip" install --upgrade pip
"$DATA_DIR/venv/bin/pip" install "$SCRIPT_DIR"
ln -sf "$DATA_DIR/venv/bin/agentdeck" "$HOME/.local/bin/agentdeck"

for agent_cli in codex claude; do
  if agent_path=$(command -v "$agent_cli" 2>/dev/null); then
    case "$agent_path" in "$HOME/.local/bin/$agent_cli") ;; *) ln -sf "$agent_path" "$HOME/.local/bin/$agent_cli" ;; esac
  fi
done

if [ ! -x "$BIN_DIR/cloudflared" ]; then
  case "$(uname -m)" in
    x86_64|amd64) CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *) fail "Unsupported CPU architecture: $(uname -m)" ;;
  esac
  echo "Downloading Cloudflare Tunnel..."
  DOWNLOAD=$(mktemp "${TMPDIR:-/tmp}/cloudflared.XXXXXX")
  trap 'rm -f "$DOWNLOAD"; stty echo 2>/dev/null || true' EXIT HUP INT TERM
  curl -fL --retry 3 "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -o "$DOWNLOAD"
  chmod 755 "$DOWNLOAD"
  "$DOWNLOAD" --version >/dev/null
  mv "$DOWNLOAD" "$BIN_DIR/cloudflared"
  trap - EXIT HUP INT TERM
fi

if [ ! -s "$STATE_DIR/relay-secret" ]; then
  umask 077
  python3 -c 'import secrets; print(secrets.token_hex(32))' > "$STATE_DIR/relay-secret"
fi
cp "$SCRIPT_DIR/scripts/run-managed-relay.sh" "$LIB_DIR/run-managed-relay.sh"
chmod 755 "$LIB_DIR/run-managed-relay.sh"
cp "$SCRIPT_DIR/deploy/agentdeck-all-in-one.service" "$SERVICE_DIR/agentdeck.service"
cp "$SCRIPT_DIR/scripts/agentdeck-url.sh" "$HOME/.local/bin/agentdeck-url"
chmod 755 "$HOME/.local/bin/agentdeck-url"

systemctl --user daemon-reload
systemctl --user enable agentdeck.service
rm -f "$URL_FILE"
systemctl --user restart agentdeck.service

echo "Waiting for the public URL to become reachable..."
attempt=0
while [ ! -s "$URL_FILE" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 240 ]; then
    systemctl --user status agentdeck.service --no-pager || true
    fail "The public URL was not created."
  fi
  sleep 1
done
PUBLIC_URL=$(sed -n '1p' "$URL_FILE")

AGENTDECK_SETUP_EMAIL="$EMAIL" AGENTDECK_SETUP_PASSWORD="$PASSWORD" \
AGENTDECK_SETUP_URL="$PUBLIC_URL" "$DATA_DIR/venv/bin/python" - <<'PY'
import json
import os
import urllib.error
import urllib.request

payload = json.dumps({
    "email": os.environ["AGENTDECK_SETUP_EMAIL"],
    "password": os.environ["AGENTDECK_SETUP_PASSWORD"],
}).encode()
request = urllib.request.Request(
    os.environ["AGENTDECK_SETUP_URL"] + "/api/v1/auth/register",
    data=payload,
    headers={"Content-Type": "application/json"},
)
try:
    urllib.request.urlopen(request, timeout=20).read()
except urllib.error.HTTPError as error:
    if error.code != 409:
        raise
PY

printf '%s\n' "$PASSWORD" | "$DATA_DIR/venv/bin/agentdeck" login \
  --server "$PUBLIC_URL" --email "$EMAIL" --name "$DEVICE_NAME" --label Personal
"$DATA_DIR/venv/bin/agentdeck" repo discover "$REPOSITORY_ROOT"

if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" 2>/dev/null || \
    echo "Note: run 'sudo loginctl enable-linger $USER' once to start AgentDeck before login."
fi

echo
echo "Setup complete. Enter this URL in the AgentDeck phone app:"
echo "  $PUBLIC_URL"
echo
echo "AgentDeck now runs in the background and starts after reboot."
echo "To show the current URL later: $HOME/.local/bin/agentdeck-url"
