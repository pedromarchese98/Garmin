"""Diagnóstico: qué métricas avanzadas devuelve Garmin para esta cuenta y este reloj."""
import json
import shutil
import tempfile
import traceback
from datetime import date, timedelta

from garminconnect import Garmin

from common import Supabase, env, read_token_file, write_token_file


def summary(obj):
    """Resumen corto: vacío o no, claves principales y una muestra."""
    if obj in (None, {}, [], ""):
        return {"vacio": True}
    s = json.dumps(obj, default=str)
    keys = list(obj.keys())[:25] if isinstance(obj, dict) else (list(obj[0].keys())[:25] if isinstance(obj, list) and obj and isinstance(obj[0], dict) else None)
    return {"vacio": False, "largo": len(s), "claves": keys, "muestra": s[:1200]}


def main() -> None:
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))
    folder = tempfile.mkdtemp(prefix="garmin_")
    db.delete("garmin_debug", {"id": "gt.0"})
    try:
        tokens = db.get_tokens()
        write_token_file(folder, tokens)
        c = Garmin()
        c.login(folder)
        hoy = date.today()
        d = (hoy - timedelta(days=1)).isoformat()
        acts = c.get_activities(0, 10) or []
        fuerza = next((a for a in acts if a.get("activityType", {}).get("typeKey") == "strength_training"), None)
        cualquiera = acts[0] if acts else None

        probes = {
            "training_status": lambda: c.get_training_status(d),
            "training_readiness": lambda: c.get_training_readiness(d),
            "morning_training_readiness": lambda: c.get_morning_training_readiness(d),
            "max_metrics_vo2": lambda: c.get_max_metrics(d),
            "fitness_age": lambda: c.get_fitnessage_data(d),
            "race_predictions": lambda: c.get_race_predictions(),
            "lactate_threshold": lambda: c.get_lactate_threshold(),
            "endurance_score": lambda: c.get_endurance_score(d),
            "hill_score": lambda: c.get_hill_score(d),
            "personal_records": lambda: c.get_personal_record(),
            "one_rep_max": lambda: c.get_one_rep_max(),
            "strength_benchmarks": lambda: c.get_strength_benchmarks(),
            "body_battery_events": lambda: c.get_body_battery_events(d),
            "all_day_stress": lambda: c.get_all_day_stress(d),
            "heart_rates_intraday": lambda: c.get_heart_rates(d),
            "respiration": lambda: c.get_respiration_data(d),
            "spo2": lambda: c.get_spo2_data(d),
            "hydration": lambda: c.get_hydration_data(d),
            "naps": lambda: c.get_naps(d),
            "health_snapshots": lambda: c.get_health_snapshots(d),
            "lifestyle_logging": lambda: c.get_lifestyle_logging_data(d),
            "hr_zones": lambda: c.get_heart_rate_zones(),
            "user_profile": lambda: {k: v for k, v in (c.get_user_profile() or {}).items() if k in ("userData",)},
            "fuerza_series": lambda: c.get_activity_exercise_sets(fuerza["activityId"]) if fuerza else None,
            "actividad_zonas_fc": lambda: c.get_activity_hr_in_timezones(cualquiera["activityId"]) if cualquiera else None,
            "actividad_splits": lambda: c.get_activity_splits(cualquiera["activityId"]) if cualquiera else None,
        }
        for label, fn in probes.items():
            try:
                data = summary(fn())
            except Exception as e:
                data = {"error": f"{type(e).__name__}: {e}"[:300]}
            db.insert("garmin_debug", {"label": label, "data": data})
            print(label, "->", "error" if "error" in data else ("vacío" if data.get("vacio") else "con datos"))

        new_tokens = read_token_file(folder)
        if new_tokens and new_tokens != tokens:
            db.save_tokens(new_tokens)
    except Exception as e:
        db.insert("garmin_debug", {"label": "fatal", "data": {"error": f"{type(e).__name__}: {e}"[:400]}})
        traceback.print_exc()
    finally:
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
