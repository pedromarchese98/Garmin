"""Funciones compartidas: acceso a Supabase y manejo de tokens de Garmin."""
import json
import os
import sys
from datetime import datetime, timezone

import requests

TOKEN_FILE = "garmin_tokens.json"


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"Falta la variable de entorno {name}.")
    return value


class Supabase:
    """Cliente mínimo para la API REST de Supabase (solo lo que necesitamos)."""

    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": key, "Content-Type": "application/json"}
        # Las claves viejas (JWT) también necesitan el header Authorization.
        if key.startswith("eyJ"):
            self.headers["Authorization"] = f"Bearer {key}"

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> None:
        if not rows:
            return
        r = requests.post(
            f"{self.base}/{table}",
            params={"on_conflict": on_conflict},
            headers={**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            data=json.dumps(rows, default=str),
            timeout=60,
        )
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase {table}: {r.status_code} {r.text[:300]}")

    def insert(self, table: str, row: dict) -> None:
        r = requests.post(
            f"{self.base}/{table}",
            headers={**self.headers, "Prefer": "return=minimal"},
            data=json.dumps(row, default=str),
            timeout=30,
        )
        if r.status_code >= 300:
            print(f"Aviso: no se pudo escribir en {table}: {r.status_code}")

    def get_tokens(self) -> dict | None:
        r = requests.get(
            f"{self.base}/garmin_auth",
            params={"id": "eq.1", "select": "tokens"},
            headers=self.headers,
            timeout=30,
        )
        r.raise_for_status()
        rows = r.json()
        return rows[0]["tokens"] if rows else None

    def save_tokens(self, tokens: dict) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.upsert("garmin_auth", [{"id": 1, "tokens": tokens, "updated_at": now}], "id")


def read_token_file(folder: str) -> dict | None:
    path = os.path.join(folder, TOKEN_FILE)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_token_file(folder: str, tokens: dict) -> None:
    os.makedirs(folder, mode=0o700, exist_ok=True)
    path = os.path.join(folder, TOKEN_FILE)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(tokens, f)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
