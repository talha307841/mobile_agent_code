# Architecture

```text
Android app ── HTTPS/WSS ──┐
                            ├── FastAPI relay ── PostgreSQL
Laptop daemon ── WSS ──────┘
      │
      ├── allowlisted repository
      └── Codex / Claude Code subprocess
```

The relay is the authority for users, device ownership, sessions, tasks, logs, and approvals. Every database query carrying user data is scoped by the authenticated user. Device credentials are independently generated, stored only as SHA-256 hashes on the relay, and revocable without affecting other laptops.

The client sends a hello message containing its allowlisted repositories and installed-agent status. The server dispatches idempotent tasks only while that device is connected. Agent JSONL output is stored, relayed to all of the user's connected phones, and retained for session restoration. Client output uses a durable SQLite outbox during transient network failure.

Codex runs with `workspace-write` and no automatic approval. Claude uses its normal permission mode. A client-side gate requires phone approval before prompts explicitly requesting pushes, deployments, migrations, or destructive actions. Production hosts should additionally run the daemon as a dedicated OS user and keep repositories scoped to that account.

Current relay deployments use one application replica because live WebSocket ownership is process-local. PostgreSQL can be highly available independently. Horizontal relay scaling requires a Redis/NATS connection registry and message backplane; do not add replicas behind a load balancer until that is configured.

