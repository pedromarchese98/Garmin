"""Login de Garmin desde GitHub Actions (sin instalar nada en tu compu).

Usa los secretos GARMIN_EMAIL y GARMIN_PASSWORD. Si Garmin pide un código
MFA, deja un pedido en la tabla garmin_mfa de Supabase y espera hasta
10 minutos a que alguien complete el código ahí.
"""
import json
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

import requests
from garminconnect import Garmin

from common import Supabase, env, read_token_file

WAIT_SECONDS = 600


def wait_for_mfa(db: Supabase) -> str:
    r = requests.post(
        f"{db.base}/garmin_mfa",
        headers={**db.headers, "Prefer": "return=representation"},
        data=json.dumps({"requested_at": datetime.now(timezone.utc).isoformat()}),
        timeout=30,
    )
    r.raise_for_status()
    req_id = r.json()[0]["id"]
    print(f"Garmin pidió un código MFA (pedido #{req_id}). Esperando hasta {WAIT_SECONDS // 60} minutos...", flush=True)
    deadline = time.time() + WAIT_SECONDS
    while time.time() < deadline:
        time.sleep(5)
        g = requests.get(
            f"{db.base}/garmin_mfa",
            params={"id": f"eq.{req_id}", "select": "code"},
            headers=db.headers,
            timeout=30,
        )
        g.raise_for_status()
        code = (g.json() or [{}])[0].get("code")
        if code:
            requests.patch(
                f"{db.base}/garmin_mfa",
                params={"id": f"eq.{req_id}"},
                headers={**db.headers, "Prefer": "return=minimal"},
                data=json.dumps({"used": True}),
                timeout=30,
            )
            print("Código recibido.", flush=True)
            return code.strip()
    sys.exit("No llegó el código MFA a tiempo. Volvé a correr la acción.")


def main() -> None:
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))
    folder = tempfile.mkdtemp(prefix="garmin_")
    try:
        client = Garmin(env("GARMIN_EMAIL"), env("GARMIN_PASSWORD"), prompt_mfa=lambda: wait_for_mfa(db))
        client.login(folder)
        tokens = read_token_file(folder)
        if not tokens:
            sys.exit("El login funcionó pero no se generaron tokens.")
        db.save_tokens(tokens)
        print("Login correcto: la sesión de Garmin quedó guardada en Supabase.")
    except SystemExit:
        raise
    except Exception as e:
        sys.exit(f"Falló el login de Garmin: {type(e).__name__}: {e}")
    finally:
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
