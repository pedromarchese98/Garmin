"""Borra de Garmin Connect los entrenamientos creados por este proyecto y sus fechas agendadas."""
import shutil
import tempfile
import traceback
from datetime import date, timedelta

from garminconnect import Garmin

from common import Supabase, env, read_token_file, write_token_file


def main() -> None:
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))
    folder = tempfile.mkdtemp(prefix="garmin_")
    try:
        tokens = db.get_tokens()
        write_token_file(folder, tokens)
        c = Garmin()
        c.login(folder)

        ids = {r["workout_id"] for r in db.select("garmin_workouts", {"select": "workout_id"})}
        start = date.today() - timedelta(days=7)
        items = c.get_scheduled_workouts_by_period(start.isoformat(), (start + timedelta(days=60)).isoformat()) or []
        quitados = 0
        for it in items:
            wid = (it.get("workout") or {}).get("workoutId") or it.get("workoutId")
            sid = it.get("workoutScheduleId")
            if wid in ids and sid:
                c.unschedule_workout(sid)
                quitados += 1
        for wid in ids:
            c.delete_workout(wid)
        db.delete("garmin_schedule", {"workout_id": "gt.0"})
        db.delete("garmin_workouts", {"workout_id": "gt.0"})

        new_tokens = read_token_file(folder)
        if new_tokens and new_tokens != tokens:
            db.save_tokens(new_tokens)
        msg = f"limpieza: {quitados} fechas quitadas, {len(ids)} entrenamientos borrados"
        db.insert("sync_log", {"status": "ok", "message": msg})
        print(msg)
    except Exception as e:
        db.insert("sync_log", {"status": "error", "message": f"limpieza: {type(e).__name__}: {e}"[:500]})
        traceback.print_exc()
        raise SystemExit(1)
    finally:
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
