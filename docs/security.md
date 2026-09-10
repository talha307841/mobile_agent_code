# Security model

- Terminate TLS at a maintained reverse proxy or cloud load balancer. Reject plain HTTP outside local development.
- Use a randomly generated JWT secret of at least 32 bytes and strong PostgreSQL credentials.
- Access JWTs expire after 15 minutes. Refresh tokens are opaque, hashed at rest, rotated on use, and individually revocable.
- Device credentials are unique, high-entropy, hashed at rest, and stored mode `0600` on the laptop.
- Repository IDs and canonical paths must exactly match the local allowlist. Symlink/path traversal substitutions are rejected.
- Codex receives workspace-only filesystem access. No laptop inbound port is opened.
- Push, deployment, migration, and destructive requests enter an explicit approval flow and every decision is audited.
- Logs can contain source code or tool output. Restrict database access, backups, and retention accordingly. AgentDeck never intentionally sends environment variables or credential files to the phone.

Threat boundary: an already-compromised laptop user account can read that laptop's repositories and AgentDeck credential. Revoke the device and rotate affected secrets after compromise. Agent output is untrusted text; the mobile app renders it as plain selectable text, not HTML.

