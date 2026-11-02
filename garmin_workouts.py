"""Crea los entrenamientos de plan.json en Garmin Connect y los agenda.

- Si un entrenamiento cambió en plan.json, lo reemplaza en Garmin.
- Agenda los próximos días según "semana" (sin duplicar).
- Los entrenamientos llegan al reloj en la próxima sincronización con el iPhone.
"""
import hashlib
import json
import shutil
import tempfile
import traceback
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from garminconnect import Garmin
from garminconnect import exercises as catalog
from garminconnect.workout import StrengthWorkout, WorkoutSegment, create_strength_set

from common import Supabase, env, read_token_file, write_token_file

DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def norm(dia: str) -> str:
    return dia.lower().replace("é", "e").replace("á", "a")


def build_strength(spec: dict) -> StrengthWorkout:
    steps, order, secs = [], 1, 0
    for ex in spec["ejercicios"]:
        entry = catalog.resolve(ex["garmin"])
        if not entry:
            raise ValueError(f"Ejercicio no encontrado en el catálogo de Garmin: {ex['garmin']}")
        steps.append(create_strength_set(
            entry["category"], step_order=order, sets=ex["series"], reps=ex["reps"],
            rest_seconds=ex["descanso"], exercise_name=entry["exercise"], description=ex.get("nota"),
        ))
        order += 3
        secs += ex["series"] * (ex["reps"] * 3 + ex["descanso"])
    sport = {"sportTypeId": 5, "sportTypeKey": "strength_training"}
    return StrengthWorkout(
        workoutName=spec["nombre"], description=spec.get("descripcion"),
        estimatedDurationInSecs=int(secs),
        workoutSegments=[WorkoutSegment(segmentOrder=1, sportType=sport, workoutSteps=steps)],
    )


def ensure_workout(c: Garmin, db: Supabase, key: str, spec: dict, today: str) -> int:
    h = hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:16]
    rows = db.select("garmin_workouts", {"key": f"eq.{key}", "select": "workout_id,plan_hash"})
    if rows and rows[0]["plan_hash"] == h:
        return rows[0]["workout_id"]
    if rows:  # cambió el plan: borramos la versión anterior y sus fechas futuras
        try:
            c.delete_workout(rows[0]["workout_id"])
        except Exception as e:
            print(f"  aviso: no se pudo borrar la versión anterior ({type(e).__name__})")
        db.delete("garmin_schedule", {"key": f"eq.{key}", "day": f"gte.{today}"})
    created = c.upload_strength_workout(build_strength(spec))
    wid = created["workoutId"]
    db.upsert("garmin_workouts", [{"key": key, "workout_id": wid, "name": spec["nombre"], "plan_hash": h,
                                   "updated_at": datetime.now(ZoneInfo("UTC")).isoformat()}], "key")
    print(f"Entrenamiento '{spec['nombre']}' creado en Garmin (id {wid}).")
    return wid


def main() -> None:
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))
    plan = json.load(open("plan.json", encoding="utf-8"))
    folder = tempfile.mkdtemp(prefix="garmin_")
    try:
        tokens = db.get_tokens()
        if not tokens:
            raise RuntimeError("No hay sesión de Garmin guardada.")
        write_token_file(folder, tokens)
        c = Garmin()
        c.login(folder)

        today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
        ids = {k: ensure_workout(c, db, k, spec, today.isoformat()) for k, spec in plan["entrenamientos"].items()}

        semana = {norm(d): k for d, k in plan["semana"].items()}
        done = {(r["day"], r["key"]) for r in db.select(
            "garmin_schedule", {"day": f"gte.{today.isoformat()}", "select": "day,key"})}
        agendados = 0
        for i in range(1, plan.get("dias_a_agendar", 14) + 1):
            d = today + timedelta(days=i)
            key = semana.get(DIAS[d.weekday()])
            if not key or (d.isoformat(), key) in done:
                continue
            c.schedule_workout(ids[key], d.isoformat())
            db.upsert("garmin_schedule", [{"day": d.isoformat(), "key": key, "workout_id": ids[key]}], "day,key")
            print(f"Agendado: {plan['entrenamientos'][key]['nombre']} el {DIAS[d.weekday()]} {d.isoformat()}")
            agendados += 1

        new_tokens = read_token_file(folder)
        if new_tokens and new_tokens != tokens:
            db.save_tokens(new_tokens)
        db.insert("sync_log", {"status": "ok", "message": f"entrenamientos: {agendados} fechas nuevas agendadas"})
        print(f"Listo: {agendados} fechas nuevas agendadas.")
    except Exception as e:
        db.insert("sync_log", {"status": "error", "message": f"entrenamientos: {type(e).__name__}: {e}"[:500]})
        traceback.print_exc()
        raise SystemExit(1)
    finally:
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
# 2026-11-02T22:41:41Z
