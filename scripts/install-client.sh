#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
python3 -m venv "$HOME/.local/share/agentdeck/venv"
"$HOME/.local/share/agentdeck/venv/bin/pip" install --upgrade pip
"$HOME/.local/share/agentdeck/venv/bin/pip" install "${1:-$PROJECT_DIR}"
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/.local/share/agentdeck/venv/bin/agentdeck" "$HOME/.local/bin/agentdeck"
for agent_cli in codex claude; do
  if agent_path=$(command -v "$agent_cli" 2>/dev/null); then
    if [ "$agent_path" != "$HOME/.local/bin/$agent_cli" ]; then
      ln -sf "$agent_path" "$HOME/.local/bin/$agent_cli"
    fi
  fi
done
if command -v systemctl >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/systemd/user"
  cp "$PROJECT_DIR/deploy/agentdeck.service" "$HOME/.config/systemd/user/agentdeck.service"
  systemctl --user daemon-reload
fi
echo "Installed AgentDeck. Next: agentdeck login, add repositories, then run:"
echo "  systemctl --user enable --now agentdeck"
