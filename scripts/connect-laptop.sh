#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 https://your-tunnel.trycloudflare.com [repository-root]"
  exit 2
fi

PUBLIC_URL=${1%/}
REPOSITORY_ROOT=${2:-"$HOME/Documents"}
case "$PUBLIC_URL" in
  https://*) ;;
  *) echo "The relay URL must begin with https://"; exit 2 ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$SCRIPT_DIR/install-client.sh"
"$HOME/.local/bin/agentdeck" login --server "$PUBLIC_URL"
"$HOME/.local/bin/agentdeck" repo discover "$REPOSITORY_ROOT"
systemctl --user enable agentdeck
systemctl --user restart agentdeck

echo
echo "Laptop connected. Open AgentDeck on your phone and refresh Machines."
