# Wire protocol

Both WebSocket endpoints use JSON text frames with a versioned envelope:

```json
{"version":1,"id":"uuid","type":"task.event","sent_at":"ISO-8601","reply_to":null,"idempotency_key":null,"payload":{}}
```

Device endpoint: `/ws/device`, authenticated with `Authorization: Bearer <device credential>`. Mobile endpoint: `/ws/mobile`, authenticated with an access JWT. Query-token authentication remains accepted only for compatibility with constrained WebSocket clients and should be disabled at the edge logs.

Message types are `hello`, `heartbeat`, `heartbeat.ack`, `ack`, `task.start`, `task.cancel`, `task.input`, `task.event`, `task.result`, `status`, `approval.request`, `approval.response`, and `error`.

Task states are `QUEUED`, `STARTING`, `ANALYZING`, `EDITING`, `TESTING`, `COMPLETED`, `FAILED`, and `CANCELLED`. The client emits only `STARTING` and terminal states itself; finer states must come from a trustworthy agent event rather than guessed progress.

REST API documentation is available from the running server at `/docs` and `/openapi.json`.

