"""Sincronización diaria: Garmin Connect -> Supabase.

Variables de entorno:
  SUPABASE_URL, SUPABASE_SECRET_KEY  (obligatorias)
  SYNC_DAYS     días hacia atrás a sincronizar (por defecto 3)
"""
import os
import shutil
import tempfile
import traceback
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from garminconnect import Garmin

from common import Supabase, env, read_token_file, write_token_file


def g(data, *path):
    """Lee un valor anidado sin romper si falta algo."""
    for key in path:
        if data is None:
            return None
        if isinstance(key, int):
            data = data[key] if isinstance(data, list) and len(data) > key else None
        else:
            data = data.get(key) if isinstance(data, dict) else None
    return data


def safe(fn, *args):
    try:
        return fn(*args)
    except Exception as e:  # una métrica que falla no frena el resto
        print(f"  - {fn.__name__} sin datos ({type(e).__name__})")
        return None


def ms_to_iso(ms):
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def as_int(v):
    return int(round(v)) if isinstance(v, (int, float)) else None


def nonneg(v):
    """Garmin usa valores negativos para 'sin datos'."""
    return v if isinstance(v, (int, float)) and v >= 0 else None


def gmt_to_iso(s):
    """'2026-10-26 10:15:00' (GMT) -> ISO con zona."""
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()


def fetch_day(c: Garmin, day: str) -> dict:
    stats = safe(c.get_stats, day) or {}
    sleep = safe(c.get_sleep_data, day) or {}
    hrv = safe(c.get_hrv_data, day) or {}
    readiness = safe(c.get_training_readiness, day)
    maxm = safe(c.get_max_metrics, day)
    body = safe(c.get_body_composition, day, day) or {}

    s = g(sleep, "dailySleepDTO") or {}
    weight_g = g(body, "totalAverage", "weight")

    row = {
        "day": day,
        "steps": stats.get("totalSteps"),
        "step_goal": stats.get("dailyStepGoal"),
        "distance_m": stats.get("totalDistanceMeters"),
        "floors_climbed": stats.get("floorsAscended"),
        "active_kcal": as_int(stats.get("activeKilocalories")),
        "total_kcal": as_int(stats.get("totalKilocalories")),
        "intensity_min_moderate": stats.get("moderateIntensityMinutes"),
        "intensity_min_vigorous": stats.get("vigorousIntensityMinutes"),
        "resting_hr": stats.get("restingHeartRate"),
        "min_hr": stats.get("minHeartRate"),
        "max_hr": stats.get("maxHeartRate"),
        "avg_stress": nonneg(stats.get("averageStressLevel")),
        "max_stress": nonneg(stats.get("maxStressLevel")),
        "body_battery_high": stats.get("bodyBatteryHighestValue"),
        "body_battery_low": stats.get("bodyBatteryLowestValue"),
        "body_battery_charged": stats.get("bodyBatteryChargedValue"),
        "body_battery_drained": stats.get("bodyBatteryDrainedValue"),
        "sleep_seconds": s.get("sleepTimeSeconds"),
        "deep_sleep_seconds": s.get("deepSleepSeconds"),
        "light_sleep_seconds": s.get("lightSleepSeconds"),
        "rem_sleep_seconds": s.get("remSleepSeconds"),
        "awake_seconds": s.get("awakeSleepSeconds"),
        "sleep_score": g(s, "sleepScores", "overall", "value"),
        "sleep_start": ms_to_iso(s.get("sleepStartTimestampGMT")),
        "sleep_end": ms_to_iso(s.get("sleepEndTimestampGMT")),
        "hrv_last_night_avg": g(hrv, "hrvSummary", "lastNightAvg"),
        "hrv_weekly_avg": g(hrv, "hrvSummary", "weeklyAvg"),
        "hrv_status": g(hrv, "hrvSummary", "status"),
        "hrv_baseline_low": g(hrv, "hrvSummary", "baseline", "balancedLow"),
        "hrv_baseline_high": g(hrv, "hrvSummary", "baseline", "balancedUpper"),
        "spo2_avg": s.get("averageSpO2Value") or stats.get("averageSpo2"),
        "spo2_min": s.get("lowestSpO2Value") or stats.get("lowestSpo2"),
        "respiration_sleep_avg": s.get("averageRespirationValue"),
        "training_readiness": g(readiness, 0, "score") if isinstance(readiness, list) else g(readiness, "score"),
        "vo2max": g(maxm, 0, "generic", "vo2MaxPreciseValue") or g(maxm, 0, "generic", "vo2MaxValue"),
        "weight_kg": round(weight_g / 1000, 2) if weight_g else None,
        "raw": {"stats": stats, "sleep": s, "hrv": g(hrv, "hrvSummary")},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return row


def fetch_activities(c: Garmin, start: str, end: str) -> list[dict]:
    items = safe(c.get_activities_by_date, start, end) or []
    rows = []
    for a in items:
        if not a.get("activityId") or not a.get("startTimeGMT"):
            continue
        rows.append({
            "activity_id": a["activityId"],
            "start_time": gmt_to_iso(a["startTimeGMT"]),
            "activity_type": g(a, "activityType", "typeKey"),
            "name": a.get("activityName"),
            "duration_seconds": a.get("duration"),
            "distance_m": a.get("distance"),
            "avg_hr": as_int(a.get("averageHR")),
            "max_hr": as_int(a.get("maxHR")),
            "kcal": as_int(a.get("calories")),
            "aerobic_te": a.get("aerobicTrainingEffect"),
            "anaerobic_te": a.get("anaerobicTrainingEffect"),
            "training_load": a.get("activityTrainingLoad"),
            "avg_speed_mps": a.get("averageSpeed"),
            "elevation_gain_m": a.get("elevationGain"),
            "raw": a,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    return rows


def main() -> None:
    db = Supabase(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))
    days = int(os.environ.get("SYNC_DAYS") or 3)
    folder = tempfile.mkdtemp(prefix="garmin_")
    try:
        tokens = db.get_tokens()
        if not tokens:
            raise RuntimeError("No hay sesión de Garmin guardada. Corré garmin_login.py en tu compu.")
        write_token_file(folder, tokens)

        client = Garmin()
        client.login(folder)

        today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
        day_list = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
        rows = []
        for d in day_list:
            print(f"Día {d}")
            rows.append(fetch_day(client, d))
        db.upsert("daily_metrics", rows, "day")

        acts = fetch_activities(client, day_list[0], day_list[-1])
        db.upsert("activities", acts, "activity_id")

        # Si Garmin renovó los tokens durante la corrida, guardamos los nuevos.
        new_tokens = read_token_file(folder)
        if new_tokens and new_tokens != tokens:
            db.save_tokens(new_tokens)
            print("Sesión de Garmin renovada y guardada.")

        db.insert("sync_log", {"status": "ok", "days_synced": len(rows), "activities_synced": len(acts)})
        print(f"OK: {len(rows)} días, {len(acts)} actividades.")
    except Exception as e:
        db.insert("sync_log", {"status": "error", "message": f"{type(e).__name__}: {e}"[:500]})
        traceback.print_exc()
        raise SystemExit(1)
    finally:
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
