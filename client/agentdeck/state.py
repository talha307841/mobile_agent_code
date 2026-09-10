import sqlite3
from pathlib import Path

from agentdeck_protocol import Envelope

from .config import config_dir


class Outbox:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or config_dir() / "outbox.db"
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def add(self, message: Envelope) -> None:
        with self._connect() as db:
            db.execute("INSERT OR IGNORE INTO outbox(id, body) VALUES (?, ?)", (str(message.id), message.model_dump_json()))

    def pending(self) -> list[Envelope]:
        with self._connect() as db:
            rows = db.execute("SELECT body FROM outbox ORDER BY created_at, id").fetchall()
        return [Envelope.model_validate_json(row[0]) for row in rows]

    def remove(self, message_id: str) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM outbox WHERE id = ?", (message_id,))

