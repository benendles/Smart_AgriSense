"""Per-service SQLite history store — one DB file per service on a mounted
PersistentVolume (DB_DIR, default /data). Persists every result so /latest
survives pod restarts and /history can power the dashboard's charts.

Degrades to an in-memory list if the volume isn't available (e.g. local dev or
a failed mount), so the service always works.
"""
import json
import os
import sqlite3
import threading
from datetime import datetime


class Store:
    def __init__(self, name: str):
        self.name = name
        self._lock = threading.Lock()
        self._conn = None
        self._mem: list[dict] = []
        db_dir = os.getenv("DB_DIR", "/data")
        try:
            os.makedirs(db_dir, exist_ok=True)
            self._conn = sqlite3.connect(f"{db_dir}/{name}.db", check_same_thread=False)
            self._conn.execute(
                "CREATE TABLE IF NOT EXISTS history "
                "(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            self._conn.commit()
            print(f"[store] {name}: persisting to {db_dir}/{name}.db")
        except Exception as e:  # no volume / read-only FS → in-memory mode
            print(f"[store] {name}: DB unavailable ({e}); using in-memory store")

    def save(self, payload: dict) -> dict:
        ts = payload.get("timestamp") or (datetime.utcnow().isoformat() + "Z")
        with self._lock:
            if self._conn is not None:
                self._conn.execute(
                    "INSERT INTO history (ts, payload) VALUES (?, ?)",
                    (ts, json.dumps(payload)),
                )
                self._conn.commit()
            else:
                self._mem.append(payload)
                del self._mem[:-500]  # keep the most recent 500
        return payload

    def latest(self) -> dict | None:
        with self._lock:
            if self._conn is not None:
                row = self._conn.execute(
                    "SELECT payload FROM history ORDER BY id DESC LIMIT 1"
                ).fetchone()
                return json.loads(row[0]) if row else None
            return self._mem[-1] if self._mem else None

    def history(self, limit: int = 50) -> list[dict]:
        with self._lock:
            if self._conn is not None:
                rows = self._conn.execute(
                    "SELECT payload FROM history ORDER BY id DESC LIMIT ?", (limit,)
                ).fetchall()
                return [json.loads(r[0]) for r in rows]
            return list(reversed(self._mem[-limit:]))
