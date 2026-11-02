"""Diagnóstico: qué ve la API de Garmin en tu cuenta (perfil, entrenamientos, calendario)."""
import json
import shutil
import tempfile
import traceback

from garminconnect import Garmin

from common import Supabase, env, read_token_file, write_token_file


def trim(obj, n=6000):
    s = json.dumps(obj, default=str)
    return json.loads(s) if len(s) <= n else {"truncated": s[:n]}


def main() -> None:
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))
    folder = tempfile.mkdtemp(prefix="garmin_")
    out = {}
    try:
        tokens = db.get_tokens()
        write_token_file(folder, tokens)
        c = Garmin()
        c.login(folder)
        steps = [
            ("perfil", lambda: {"full_name": c.get_full_name(), "display_name": getattr(c, "display_name", None)}),
            ("dispositivos", lambda: [{k: d.get(k) for k in ("productDisplayName", "deviceId", "unitId", "displayName")} for d in (c.get_devices() or [])]),
            ("mis_entrenamientos", lambda: [{k: w.get(k) for k in ("workoutId", "workoutName", "sportType", "createdDate")} for w in c.get_workouts(0, 20)]),
            ("agendados_periodo", lambda: c.get_scheduled_workouts_by_period("2026-11-01", "2026-11-30")),
            ("calendario_nov", lambda: [{k: i.get(k) for k in ("id", "itemType", "title", "date", "workoutId")} for i in (c.get_calendar_year(2026) or {}).get("calendarItems", []) if str(i.get("date", "")).startswith("2026-11")] if hasattr(c, "get_calendar_year") else None),
        ]
        for label, fn in steps:
            try:
                out[label] = trim(fn())
            except Exception as e:
                out[label] = {"error": f"{type(e).__name__}: {e}"[:400]}
        new_tokens = read_token_file(folder)
        if new_tokens and new_tokens != tokens:
            db.save_tokens(new_tokens)
    except Exception as e:
        out["fatal"] = f"{type(e).__name__}: {e}"[:400]
        traceback.print_exc()
    finally:
        shutil.rmtree(folder, ignore_errors=True)
    for label, data in out.items():
        db.insert("garmin_debug", {"label": label, "data": data})
    print(json.dumps({k: (str(v)[:200]) for k, v in out.items()}, indent=1))


if __name__ == "__main__":
    main()
