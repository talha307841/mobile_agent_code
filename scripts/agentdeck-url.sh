#!/bin/sh
set -eu

URL_FILE=${AGENTDECK_URL_FILE:-"$HOME/.local/state/agentdeck/public-url"}
if [ ! -s "$URL_FILE" ]; then
  echo "AgentDeck does not have a public URL yet." >&2
  echo "Check it with: systemctl --user status agentdeck" >&2
  exit 1
fi

sed -n '1p' "$URL_FILE"
