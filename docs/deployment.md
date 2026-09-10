# Production deployment

1. Provision a DNS name, TLS certificate, PostgreSQL database, and a Linux host/container platform.
2. Copy `.env.example` to `.env`, replace all values, and restrict the file to its owner.
3. Run `docker compose up --build -d`; the server applies Alembic migrations before accepting traffic.
4. Put Caddy, nginx, or a managed load balancer in front of port 8000 with WebSocket upgrade support, request size limits, TLS 1.2+, and redaction of authorization/query strings.
5. Configure backups, database encryption, log retention, health checks (`/health/live`, `/health/ready`), alerts, and container image updates.
6. Keep exactly one relay application replica unless a distributed WebSocket backplane is added.

Cross-network verification requires the relay to be reachable by public HTTPS/WSS. Test laptop disconnect/reconnect, phone background/foreground, credential revocation, an unauthorized repo ID, and a real Codex task before relying on it remotely.

