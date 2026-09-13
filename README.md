# AgentDeck

AgentDeck securely controls Codex and Claude Code sessions on allowlisted laptop repositories from an Android-first Expo app. Laptops make outbound authenticated WebSocket connections to a FastAPI relay; no SSH port or laptop service is exposed to the internet.

## Repository layout

- `server/` — FastAPI API, relay, authentication, audit records, approvals
- `client/` — Python laptop daemon and Codex/Claude adapters
- `mobile-app/` — React Native/Expo Android app
- `shared/` — versioned Pydantic wire protocol
- `migrations/` — Alembic production database migrations
- `deploy/` — systemd service

## Local setup

Requirements: Python 3.10+, Docker, Node 22+ for mobile development, and an authenticated Codex and/or Claude Code CLI on each laptop.

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env
# Replace every example secret in .env.
docker compose up --build -d
```

Create the first mobile account through the app, or use `POST /api/v1/auth/register`. Configure the laptop:

```bash
.venv/bin/agentdeck login --server https://relay.example.com --email you@example.com --name 'Personal laptop' --label Personal
.venv/bin/agentdeck repo add ~/projects/money-tracker --name money-tracker
# Or allowlist every Git repository below a directory:
.venv/bin/agentdeck repo discover ~/Documents
.venv/bin/agentdeck daemon
```

Install the daemon as a user service:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/agentdeck.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now agentdeck
loginctl enable-linger "$USER"
```

For Android development:

```bash
cd mobile-app
npm install
# Set expo.extra.apiUrl in app.json to an HTTPS relay reachable by the phone.
npm run android
```

The login screen also accepts a relay URL, allowing a LAN endpoint during device testing. Production must use HTTPS; WSS is derived automatically.

## Verification

```bash
.venv/bin/ruff check server client shared migrations
.venv/bin/pytest
cd mobile-app && npm run typecheck && npm test
docker compose config
```

See [architecture](docs/architecture.md), [protocol](docs/protocol.md), [security](docs/security.md), and [deployment](docs/deployment.md).

## Free cross-network testing

Start a free temporary public relay. The script downloads the official
`cloudflared` binary locally if it is not already installed:

```bash
./scripts/start-public-relay.sh
```

The command prints a `https://...trycloudflare.com` address. Enter that exact
address in the phone app. On each additional laptop, clone/open this project
and run the printed `connect-laptop.sh` command. The URL changes whenever the
Quick Tunnel is recreated, and the relay laptop must remain powered on; use a
named Cloudflare Tunnel or hosted relay for permanent use.
