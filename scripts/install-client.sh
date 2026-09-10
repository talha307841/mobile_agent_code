#!/bin/sh
set -eu
python3 -m venv "$HOME/.local/share/agentdeck/venv"
"$HOME/.local/share/agentdeck/venv/bin/pip" install --upgrade pip
"$HOME/.local/share/agentdeck/venv/bin/pip" install "${1:-.}"
mkdir -p "$HOME/.local/bin"
ln -sf "$HOME/.local/share/agentdeck/venv/bin/agentdeck" "$HOME/.local/bin/agentdeck"
echo "Installed agentdeck. Next: agentdeck login"
