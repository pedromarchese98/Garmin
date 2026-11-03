import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const SUPABASE_URL = "https://mlpvtvgtkkzdhsqvqsck.supabase.co";
const SUPABASE_KEY = "sb_publishable_7_tqDKLW14IvcTBMr1c8JA_whyPZW2f";
const OWNER = "pedromarchese98@gmail.com";
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (v, d = 0) => (n(v) === null ? "—" : n(v).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseDay = (s) => new Date(String(s).slice(0, 10) + "T12:00:00");
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const longDate = (d) => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
const shortDate = (d) => `${d.getDate()} ${MES_C[d.getMonth()]}`;
const hm = (h) => (n(h) === null ? "—" : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`);
const mmss = (s) => (n(s) === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const hms = (s) => (n(s) === null ? "—" : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}` : mmss(s));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const daysAgoISO = (k) => { const d = new Date(Date.now() - k * 864e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data || [];
}

/* Markdown mínimo y seguro para los informes */
function md(text) {
  const lines = esc(text).split(/\n/);
  let html = "", inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (/^#{1,3}\s+/.test(line)) html += `<h3>${line.replace(/^#{1,3}\s+/, "")}</h3>`;
      else if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  return html + (inList ? "</ul>" : "");
}

/* ---------- gráficos (SVG propio) ---------- */
function chart({ points, series, band, refs = [], bars, height = 170, yFmt = (v) => fmt(v), yMin, yMax }) {
  const W = 340, H = height, ml = 30, mr = 8, mt = 8, mb = 22;
  if (!points.length) return `<p class="muted small">Todavía no hay datos para este gráfico.</p>`;
  const xs = points.map((p) => p.date.getTime());
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const vals = [];
  points.forEach((p) => {
    (series || []).forEach((s) => n(p[s.key]) !== null && vals.push(n(p[s.key])));
    if (bars && n(p[bars.key]) !== null) vals.push(n(p[bars.key]));
    if (band) { [band[0], band[1]].forEach((k) => n(p[k]) !== null && vals.push(n(p[k]))); }
  });
  refs.forEach((r) => vals.push(r.v));
  if (!vals.length) return `<p class="muted small">Todavía no hay datos para este gráfico.</p>`;
  let lo = yMin ?? Math.min(...vals), hi = yMax ?? Math.max(...vals);
  if (bars && yMin === undefined) lo = 0;
  if (hi === lo) { hi += 1; lo -= bars ? 0 : 1; }
  const pad = (hi - lo) * 0.08;
  if (yMax === undefined) hi += pad;
  if (yMin === undefined && !bars) lo -= pad;
  const step = (W - ml - mr) / Math.max(1, points.length - (bars ? 0 : 1));
  const X = (p, i) => (bars ? ml + step * (i + 0.5) : x1 === x0 ? (ml + W - mr) / 2 : ml + ((p.date.getTime() - x0) / (x1 - x0)) * (W - ml - mr));
  const Y = (v) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);
  const raw = (hi - lo) / 3, mag = 10 ** Math.floor(Math.log10(raw || 1));
  const stepT = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let t = Math.ceil(lo / stepT) * stepT; t <= hi + 1e-9; t += stepT) ticks.push(+t.toFixed(6));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  ticks.forEach((t) => { s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="${css("--chalk")}" stroke-width="1"/><text x="${ml - 5}" y="${Y(t) + 4}" text-anchor="end">${yFmt(t)}</text>`; });
  if (band) {
    const bp = points.map((p, i) => [p, i]).filter(([p]) => n(p[band[0]]) !== null && n(p[band[1]]) !== null);
    if (bp.length > 1) {
      const top = bp.map(([p, i]) => `${X(p, i)},${Y(n(p[band[1]]))}`).join(" ");
      const bot = bp.slice().reverse().map(([p, i]) => `${X(p, i)},${Y(n(p[band[0]]))}`).join(" ");
      s += `<polygon points="${top} ${bot}" fill="${css("--band")}"/>`;
    }
  }
  if (bars) {
    const bw = Math.max(2, Math.min(18, step * 0.62));
    points.forEach((p, i) => {
      const v = n(p[bars.key]);
      if (v === null) return;
      const c = bars.color ? bars.color(v, p) : css("--grass");
      s += `<rect x="${X(p, i) - bw / 2}" y="${Y(Math.max(v, lo))}" width="${bw}" height="${Math.max(0, Y(lo) - Y(Math.max(v, lo)))}" rx="${Math.min(3, bw / 2)}" fill="${c}"><title>${shortDate(p.date)}: ${esc(bars.fmt ? bars.fmt(v) : yFmt(v))}</title></rect>`;
    });
  }
  refs.forEach((r) => { s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(r.v)}" y2="${Y(r.v)}" stroke="${r.color || css("--ink-2")}" stroke-dasharray="4 4" stroke-width="1"/><text x="${W - mr}" y="${Y(r.v) - 4}" text-anchor="end">${esc(r.label)}</text>`; });
  (series || []).forEach((se) => {
    let d = "", pen = false;
    points.forEach((p, i) => {
      const v = n(p[se.key]);
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(p, i).toFixed(1)} ${Y(v).toFixed(1)} `; pen = true;
    });
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-linecap="round" stroke-linejoin="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""}/>`;
  });
  const first = points[0], last = points[points.length - 1];
  s += `<text x="${X(first, 0)}" y="${H - 4}" text-anchor="start">${shortDate(first.date)}</text>`;
  if (points.length > 1) s += `<text x="${X(last, points.length - 1)}" y="${H - 4}" text-anchor="end">${shortDate(last.date)}</text>`;
  return s + "</svg>";
}
const legend = (items) => `<div class="legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join("")}</div>`;

/* ---------- rutina y recomendación ---------- */
const RUTINA = { 1: "fuerza", 2: "futbol", 3: "circuito", 4: "fuerza", 5: "fuerza", 6: "descanso", 0: "descanso" };
const NOMBRE = { fuerza: "Fuerza con mancuernas", futbol: "Fútbol", circuito: "Circuito en el gimnasio", descanso: "Día libre" };
const CONSEJO = {
  fuerza: ["Hacé la rutina completa y probá subir el peso en un ejercicio.", "Hacé la rutina con una serie menos por ejercicio y sin ir al fallo.", "Cambiala por 20 minutos de movilidad o una caminata."],
  futbol: ["Jugá a pleno.", "Jugá, pero calentá bien y dosificá los piques.", "Si podés, entrená suave o jugá menos minutos."],
  circuito: ["Hacé el circuito completo.", "Bajá la intensidad en los bloques de cardio.", "Mejor movilidad o descanso hoy."],
  descanso: ["Día libre: una caminata de 30 minutos suma pasos sin cansarte.", "Descansá y priorizá dormir temprano.", "Descanso total y a dormir temprano."],
};
const estado = (s) => (s === null ? null : s >= 70 ? { k: "go", t: "Listo para exigirte", i: 0 } : s >= 50 ? { k: "wait", t: "Entrená con moderación", i: 1 } : { k: "stop", t: "Priorizá recuperar", i: 2 });

/* ---------- pantallas ---------- */
async function renderHoy() {
  const [rd, reps, sync] = await Promise.all([
    q(db.from("v_readiness").select("*").order("day", { ascending: false }).limit(1)),
    q(db.from("coach_reports").select("*").eq("kind", "diario").order("day", { ascending: false }).limit(1)),
    q(db.from("sync_log").select("ran_at,status").eq("status", "ok").order("ran_at", { ascending: false }).limit(1)),
  ]);
  const r = rd[0] || {};
  const hoy = new Date();
  const score = n(r.disposicion);
  const st = estado(score);
  const act = RUTINA[hoy.getDay()];
  const C = 2 * Math.PI * 84 * 0.75;
  const off = score === null ? C : C * (1 - score / 100);
  const col = st ? css(`--${st.k}`) : css("--chalk");
  const dayLabel = r.day ? (r.day === todayISO() ? "datos de esta mañana" : `datos del ${shortDate(parseDay(r.day))}`) : "sin datos todavía";

  const factor = (label, val, p, note) => `<li><span class="label">${label}</span><span class="val">${val}</span>
    <span class="bar" aria-hidden="true"><i style="width:${n(p) === null ? 0 : Math.max(4, n(p))}%"></i></span>${note ? `<span class="note">${note}</span>` : ""}</li>`;
  const parte = reps[0] && reps[0].day === todayISO() ? reps[0] : null;

  view.innerHTML = `
    <p class="date">${longDate(hoy)}</p>
    <h1 class="title">Cómo llegás hoy</h1>
    <div class="gauge">
      <svg viewBox="0 0 200 170" aria-hidden="true">
        <circle cx="100" cy="100" r="84" fill="none" stroke="${css("--chalk")}" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${C} ${2 * Math.PI * 84}" transform="rotate(135 100 100)"/>
        <circle class="arc" cx="100" cy="100" r="84" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${C} ${2 * Math.PI * 84}" stroke-dashoffset="${C}" transform="rotate(135 100 100)"/>
        <line x1="34" y1="112" x2="166" y2="112" stroke="${css("--chalk")}" stroke-width="1.5"/>
        <circle cx="100" cy="112" r="3" fill="${css("--chalk")}"/>
        <text x="100" y="100" text-anchor="middle" class="g-num" fill="${css("--ink")}">${score === null ? "—" : score}</text>
        <text x="100" y="134" text-anchor="middle" class="g-sub" fill="${css("--ink-2")}">de 100</text>
        <text x="100" y="150" text-anchor="middle" class="g-sub" fill="${css("--ink-2")}">${dayLabel}</text>
      </svg>
    </div>
    <p class="state ${st ? st.k : ""}">${st ? st.t : "Esperando tu primera noche con datos"}</p>

    <div class="plan">
      <h3>Hoy toca: ${NOMBRE[act]}</h3>
      <p>${st ? CONSEJO[act][st.i] : "Cuando haya datos de tu noche te digo cómo encararlo."}</p>
    </div>

    ${parte ? `<h2>Parte del día</h2><div class="report">${md(parte.body)}</div>` : ""}

    <h2>De dónde sale el número</h2>
    <ul class="factors">
      ${factor("Variabilidad cardíaca (HRV)", r.hrv_noche ? `${fmt(r.hrv_noche)} ms` : "—", r.p_hrv, r.hrv_baseline_60d ? `Tu promedio de 60 días: ${fmt(r.hrv_baseline_60d)} ms` : "")}
      ${factor("FC en reposo", r.fc_reposo ? `${fmt(r.fc_reposo)} lpm` : "—", r.p_fc, r.rhr_baseline_60d ? `Tu promedio de 60 días: ${fmt(r.rhr_baseline_60d, 1)} lpm` : "")}
      ${factor("Sueño", hm(n(r.sueno_h)), r.p_sueno, r.sueno_necesario_h ? `Necesitabas ${hm(n(r.sueno_necesario_h))} según Garmin` : "")}
      ${factor("Body Battery al despertar", fmt(r.bb_despertar), r.p_bb)}
      ${factor("Carga de entrenamiento", r.p_carga === null || r.p_carga === undefined ? "sin historia" : fmt(r.acwr, 2), r.p_carga, r.p_carga === null || r.p_carga === undefined ? "Se suma cuando haya un mes de entrenamientos registrados" : "Semana actual dividida por tu promedio del mes")}
    </ul>
    <p class="foot">Es un indicador propio, armado con tus datos; sirve para orientar el entrenamiento, no es un dato médico.<br>
      Última sincronización: ${sync[0] ? new Date(sync[0].ran_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—"} ·
      <button id="change-pw">Cambiar contraseña</button> · <button id="logout">Cerrar sesión</button></p>
    <form id="pw-form" class="goal-form" hidden>
      <label class="small muted" for="new-pw">Nueva contraseña (mínimo 8 caracteres)</label>
      <div class="pair"><input id="new-pw" type="text" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" minlength="8" required>
        <button class="btn btn-small" type="submit">Guardar contraseña</button></div>
      <p id="pw-msg" class="small muted" role="status"></p>
    </form>`;
  requestAnimationFrame(() => { const a = $(".arc"); if (a) a.style.strokeDashoffset = off; });
  $("#logout").onclick = async () => { await db.auth.signOut(); location.reload(); };
  $("#change-pw").onclick = () => { $("#pw-form").hidden = false; $("#new-pw").focus(); };
  $("#pw-form").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("#new-pw").value;
    if (pw.length < 8) { $("#pw-msg").textContent = "Usá al menos 8 caracteres."; return; }
    const { error } = await db.auth.updateUser({ password: pw });
    $("#pw-msg").textContent = error ? "No se pudo cambiar: " + error.message : "Contraseña cambiada. Usala para entrar desde la pantalla de inicio.";
    if (!error) $("#new-pw").value = "";
  };
}

async function renderFutbol() {
  const acts = await q(db.from("v_activities").select("*").in("categoria", ["futbol", "circuito"]).order("start_time", { ascending: false }).limit(40));
  const futbol = acts.filter((a) => a.categoria === "futbol");
  const lista = futbol.length ? futbol : [];
  const pts = lista.slice().reverse().map((a) => ({ date: parseDay(a.day), carga: n(a.carga), alta: n(a.z4_min) + n(a.z5_min) }));
  const ultimos = futbol.slice(0, 4);
  const avg = (k) => (ultimos.length ? ultimos.reduce((s, a) => s + (n(a[k]) || 0), 0) / ultimos.length : null);

  view.innerHTML = `
    <p class="date">Partidos y entrenamientos</p>
    <h1 class="title">Fútbol</h1>
    ${futbol.length ? `
      <div class="stats">
        <div class="stat"><b>${fmt(avg("km"), 1)}</b><span>km por partido</span></div>
        <div class="stat"><b>${fmt(avg("z4_min") + avg("z5_min"))}</b><span>min en zonas altas</span></div>
        <div class="stat"><b>${fmt(avg("vel_max_kmh"), 1)}</b><span>km/h de punta</span></div>
      </div>
      <p class="muted small">Promedio de los últimos ${ultimos.length} ${ultimos.length === 1 ? "partido" : "partidos"}.</p>
      <h2>Minutos de alta intensidad por partido</h2>
      <div class="chart">${chart({ points: pts, bars: { key: "alta", fmt: (v) => `${fmt(v)} min` }, height: 150, yFmt: (v) => `${fmt(v)}'` })}</div>
      <p class="muted small">Tiempo en zonas de FC 4 y 5: lo que más se parece a lo que exige un partido. Que suba con las semanas indica que aguantás más tiempo a ritmo alto.</p>
      <h2>Últimos partidos</h2>
      <ul class="list">${futbol.slice(0, 12).map((a) => `<li>
        <div class="row"><strong>${esc(a.name || "Fútbol")}</strong><span class="muted small">${shortDate(parseDay(a.day))}</span></div>
        <div class="chips"><span><b>${fmt(a.minutos)}</b> min</span><span><b>${fmt(a.km, 2)}</b> km</span>
          <span>FC <b>${fmt(a.avg_hr)}</b> / ${fmt(a.max_hr)}</span><span>punta <b>${fmt(a.vel_max_kmh, 1)}</b> km/h</span>
          <span>zonas altas <b>${fmt(n(a.z4_min) + n(a.z5_min))}</b> min</span><span>carga <b>${fmt(a.carga)}</b></span></div></li>`).join("")}</ul>`
    : `<div class="empty"><strong>Todavía no hay partidos registrados como Fútbol.</strong>
        La próxima vez que juegues, elegí la actividad Fútbol en el reloj (en Deportes de equipo). Así aparecen acá la distancia, la velocidad de punta y la intensidad de cada partido.</div>`}
    ${acts.filter((a) => a.categoria === "circuito").length ? `<h2>Circuitos y otros</h2>
      <ul class="list">${acts.filter((a) => a.categoria === "circuito").slice(0, 6).map((a) => `<li>
        <div class="row"><strong>${esc(a.name || a.activity_type)}</strong><span class="muted small">${shortDate(parseDay(a.day))}</span></div>
        <div class="chips"><span><b>${fmt(a.minutos)}</b> min</span><span>FC <b>${fmt(a.avg_hr)}</b> / ${fmt(a.max_hr)}</span><span>carga <b>${fmt(a.carga)}</b></span></div></li>`).join("")}</ul>
      <p class="muted small">Algunos de estos fueron partidos grabados como Movilidad; desde ahora usá Fútbol o HIIT para que se clasifiquen bien.</p>` : ""}`;
}

const EJ = {
  PUSH_UP: "Flexiones", CURL: "Curl de bíceps", SHOULDER_PRESS: "Press de hombros", SQUAT: "Sentadilla", LUNGE: "Estocadas",
  LATERAL_RAISE: "Elevaciones laterales", TRICEPS_EXTENSION: "Tríceps", BENCH_PRESS: "Press de pecho", ROW: "Remo", PULL_UP: "Dominadas",
  DEADLIFT: "Peso muerto", PLANK: "Plancha", CRUNCH: "Abdominales", TOTAL_BODY: "Cuerpo completo", HIP_RAISE: "Puente de cadera",
  CALF_RAISE: "Gemelos", SHRUG: "Encogimientos", CORE: "Core", UNKNOWN: "Sin identificar",
};
async function renderFuerza() {
  const sets = await q(db.from("strength_sets").select("*").gte("day", daysAgoISO(120)).order("day", { ascending: true }));
  const porDia = {};
  sets.forEach((s) => { (porDia[s.day] ||= []).push(s); });
  const sesiones = Object.entries(porDia).map(([day, ss]) => ({ day, series: ss.length, reps: ss.reduce((t, s) => t + (n(s.reps) || 0), 0), vol: ss.reduce((t, s) => t + (n(s.reps) || 0) * (n(s.weight_kg) || 0), 0) })).reverse();
  const ej = {};
  sets.forEach((s) => {
    const k = s.category || "UNKNOWN";
    const e = (ej[k] ||= { k, series: 0, maxReps: 0, maxKg: 0, last: s.day });
    e.series++; e.maxReps = Math.max(e.maxReps, n(s.reps) || 0); e.maxKg = Math.max(e.maxKg, n(s.weight_kg) || 0); e.last = s.day;
  });
  const pocasSeries = sesiones.length && sesiones.every((x) => x.series <= 2);
  const pts = sesiones.slice().reverse().map((x) => ({ date: parseDay(x.day), reps: x.reps }));

  view.innerHTML = `
    <p class="date">Últimos 4 meses</p>
    <h1 class="title">Fuerza</h1>
    ${sesiones.length ? `
      <div class="stats">
        <div class="stat"><b>${sesiones.filter((x) => parseDay(x.day) > new Date(Date.now() - 28 * 864e5)).length}</b><span>sesiones en 4 semanas</span></div>
        <div class="stat"><b>${fmt(sesiones[0].series)}</b><span>series la última vez</span></div>
        <div class="stat"><b>${fmt(sesiones[0].reps)}</b><span>repeticiones la última vez</span></div>
      </div>
      ${pocasSeries ? `<div class="empty"><strong>El reloj está registrando cada sesión como una sola serie.</strong>
        Tocá el botón al terminar cada serie (o activá Series automáticas en la actividad Fuerza) y al final confirmá ejercicio y peso. Con eso acá ves el volumen y la progresión de cada ejercicio.</div>` : ""}
      <h2>Repeticiones por sesión</h2>
      <div class="chart">${chart({ points: pts, bars: { key: "reps" }, height: 150 })}</div>
      <h2>Por ejercicio</h2>
      <table class="t"><thead><tr><th>Ejercicio</th><th class="r">Series</th><th class="r">Mejor reps</th><th class="r">Peso máx.</th></tr></thead>
        <tbody>${Object.values(ej).sort((a, b) => b.series - a.series).map((e) => `<tr><td>${esc(EJ[e.k] || e.k.toLowerCase().replace(/_/g, " "))}</td>
          <td class="r">${e.series}</td><td class="r">${e.maxReps || "—"}</td><td class="r">${e.maxKg ? fmt(e.maxKg, 1) + " kg" : "—"}</td></tr>`).join("")}</tbody></table>
      <p class="muted small">El ejercicio lo reconoce el reloj automáticamente; si se equivoca, corregilo en Garmin Connect y se actualiza acá.</p>`
    : `<div class="empty"><strong>Todavía no hay series registradas.</strong>
        Grabá tu próxima rutina con la actividad Fuerza y tocá el botón al terminar cada serie. Acá vas a ver series, repeticiones y peso por ejercicio, y cómo progresás.</div>`}`;
}

async function renderSueno() {
  const [ins, dm] = await Promise.all([
    q(db.from("v_readiness").select("day,sueno_h,sueno_necesario_h").gte("day", daysAgoISO(30)).order("day")),
    q(db.from("daily_metrics").select("day,sleep_start,sleep_score,deep_sleep_seconds,rem_sleep_seconds,hrv_last_night_avg,avg_stress").gte("day", daysAgoISO(30)).order("day")),
  ]);
  const hrv = await q(db.from("v_daily_insights").select("day,hrv_last_night_avg,hrv_7d,hrv_band_low,hrv_band_high").gte("day", daysAgoISO(30)).order("day"));
  const noches = ins.filter((x) => n(x.sueno_h) !== null);
  const avgH = noches.length ? noches.reduce((s, x) => s + n(x.sueno_h), 0) / noches.length : null;
  const debajo = noches.filter((x) => n(x.sueno_necesario_h) && n(x.sueno_h) < n(x.sueno_necesario_h) - 0.25).length;
  // Regularidad: desvío del horario de dormir (minutos)
  const starts = dm.filter((x) => x.sleep_start).map((x) => { const d = new Date(x.sleep_start); let m = d.getHours() * 60 + d.getMinutes(); if (m < 12 * 60) m += 24 * 60; return m; });
  const mean = starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : null;
  const sd = starts.length > 2 ? Math.sqrt(starts.reduce((a, b) => a + (b - mean) ** 2, 0) / (starts.length - 1)) : null;
  const hora = mean === null ? "—" : `${String(Math.floor((mean / 60) % 24)).padStart(2, "0")}:${String(Math.round(mean % 60)).padStart(2, "0")}`;
  const ptsS = ins.map((x) => ({ date: parseDay(x.day), h: n(x.sueno_h), need: n(x.sueno_necesario_h) }));
  const ptsH = hrv.map((x) => ({ date: parseDay(x.day), noche: n(x.hrv_last_night_avg), avg: n(x.hrv_7d), lo: n(x.hrv_band_low), hi: n(x.hrv_band_high) }));

  view.innerHTML = `
    <p class="date">Últimos 30 días</p>
    <h1 class="title">Sueño y recuperación</h1>
    <div class="stats">
      <div class="stat"><b>${hm(avgH)}</b><span>promedio por noche</span></div>
      <div class="stat"><b>${debajo}/${noches.length}</b><span>noches debajo de lo que necesitabas</span></div>
      <div class="stat"><b>${hora}</b><span>hora media de dormirte${sd !== null ? ` (±${Math.round(sd)} min)` : ""}</span></div>
    </div>
    <h2>Horas dormidas</h2>
    ${legend([[css("--grass"), "Dormiste"], [css("--ink-2"), "Necesitabas (Garmin)"]])}
    <div class="chart">${chart({ points: ptsS, bars: { key: "h", fmt: (v) => hm(v), color: (v, p) => (p.need && v < p.need - 0.25 ? css("--wait") : css("--grass")) }, series: [{ key: "need", color: css("--ink-2"), width: 1.5, dash: "3 3" }], yFmt: (v) => `${Math.round(v)} h` })}</div>
    <p class="muted small">En ámbar, las noches en que dormiste bastante menos de lo que necesitabas. Acostarte a una hora parecida todos los días ayuda tanto como dormir más.</p>
    <h2>Variabilidad cardíaca</h2>
    ${legend([[css("--grass"), "Promedio 7 días"], [css("--chalk"), "Cada noche"], [css("--band"), "Tu rango normal"]])}
    <div class="chart">${chart({ points: ptsH, band: ["lo", "hi"], series: [{ key: "noche", color: css("--chalk"), width: 1.5 }, { key: "avg", color: css("--grass") }] })}</div>
    <p class="muted small">Si el promedio de 7 días cae debajo de tu rango varios días seguidos, te falta recuperación: dormí más y bajá la intensidad.</p>`;
}

const METRICAS = {
  fc_reposo: { label: "FC en reposo (lpm)", dir: "bajar", fmt: (v) => fmt(v, 1) },
  sueno_h: { label: "Horas de sueño por noche", dir: "subir", fmt: (v) => hm(v) },
  pasos: { label: "Pasos por día", dir: "subir", fmt: (v) => fmt(v) },
  dias_vigorosos: { label: "Días vigorosos por semana", dir: "subir", fmt: (v) => fmt(v) },
  hrv: { label: "HRV promedio (ms)", dir: "subir", fmt: (v) => fmt(v) },
  race_5k_s: { label: "5 km estimados (mm:ss)", dir: "bajar", fmt: mmss, time: true },
  race_10k_s: { label: "10 km estimados (mm:ss)", dir: "bajar", fmt: mmss, time: true },
  fitness_age: { label: "Edad fitness", dir: "bajar", fmt: (v) => fmt(v, 1) },
};

async function renderProgreso() {
  const [wk, fit, goals, sem] = await Promise.all([
    q(db.from("v_weekly").select("*").order("semana", { ascending: false }).limit(13)),
    q(db.from("fitness_snapshots").select("*").order("day", { ascending: true }).limit(400)),
    q(db.from("goals").select("*").eq("active", true).order("created_at")),
    q(db.from("coach_reports").select("*").eq("kind", "semanal").order("day", { ascending: false }).limit(1)),
  ]);
  const semanas = wk.slice().reverse();
  const actual = wk[1] || wk[0] || {}; // última semana completa
  const base = semanas.slice(0, 4);
  const avgBase = (k) => (base.length ? base.reduce((s, w) => s + (n(w[k]) || 0), 0) / base.length : null);
  const lastFit = fit[fit.length - 1] || {};
  const cur = {
    fc_reposo: n(actual.fc_reposo), sueno_h: n(actual.sueno_h), pasos: n(actual.pasos), dias_vigorosos: n(actual.dias_vigorosos),
    hrv: n(actual.hrv), race_5k_s: n(lastFit.race_5k_s), race_10k_s: n(lastFit.race_10k_s), fitness_age: n(lastFit.fitness_age),
  };
  const comp = [
    ["Sueño por noche", "sueno_h", (v) => hm(v), +1], ["FC en reposo", "fc_reposo", (v) => `${fmt(v, 1)} lpm`, -1],
    ["HRV", "hrv", (v) => `${fmt(v)} ms`, +1], ["Pasos por día", "pasos", (v) => fmt(v), +1],
    ["Días vigorosos", "dias_vigorosos", (v) => fmt(v), +1], ["Carga semanal", "carga", (v) => fmt(v), 0],
  ];
  const ptsW = semanas.map((w) => ({ date: parseDay(w.semana), dv: n(w.dias_vigorosos), carga: n(w.carga) }));

  view.innerHTML = `
    <p class="date">Semana a semana</p>
    <h1 class="title">Progreso</h1>
    ${sem[0] ? `<h2>Informe de la semana</h2><div class="report">${md(sem[0].body)}</div>` : ""}
    <h2>Tu última semana contra el comienzo</h2>
    <table class="t"><thead><tr><th></th><th class="r">Primeras 4 semanas</th><th class="r">Última semana</th></tr></thead>
      <tbody>${comp.map(([l, k, f, better]) => { const b = avgBase(k), a = n(actual[k]); const good = better === 0 || a === null || b === null ? "" : (a - b) * better > 0 ? "go" : (a - b) * better < 0 ? "stop" : "";
        return `<tr><td>${l}</td><td class="r">${b === null ? "—" : f(b)}</td><td class="r" style="color:${good ? css(`--${good}`) : "inherit"}">${a === null ? "—" : f(a)}</td></tr>`; }).join("")}</tbody></table>
    <h2>Días vigorosos por semana</h2>
    <div class="chart">${chart({ points: ptsW, bars: { key: "dv", color: (v) => (v >= 3 ? css("--go") : css("--grass")) }, refs: [{ v: 3, label: "meta: 3" }], height: 150 })}</div>
    <p class="muted small">Garmin marca los días con 20 minutos vigorosos o más como la palanca que más baja tu edad fitness.</p>
    <h2>Capacidad</h2>
    <div class="stats">
      <div class="stat"><b>${fmt(lastFit.fitness_age, 1)}</b><span>edad fitness (reales ${fmt(lastFit.chronological_age)})</span></div>
      <div class="stat"><b>${mmss(n(lastFit.race_5k_s))}</b><span>5 km estimados</span></div>
      <div class="stat"><b>${hms(n(lastFit.race_10k_s))}</b><span>10 km estimados</span></div>
    </div>
    <p class="muted small">Se actualizan solos con tus entrenamientos; desde hoy queda guardada su evolución.</p>
    <h2>Metas</h2>
    <div id="goals">${goals.length ? goals.map((g) => {
      const m = METRICAS[g.metric] || { label: g.label, fmt: (v) => fmt(v) }; const c = cur[g.metric];
      const pct = c === null || c === undefined ? 0 : g.direction === "subir" ? Math.min(100, (c / g.target) * 100) : Math.min(100, (g.target / c) * 100);
      return `<div class="goal"><div class="row"><strong>${esc(g.label)}</strong><button data-del="${g.id}" aria-label="Borrar meta ${esc(g.label)}">Borrar</button></div>
        <div class="muted small">Ahora ${c === null || c === undefined ? "—" : m.fmt(c)} · meta ${m.fmt(n(g.target))}</div>
        <div class="track"><i style="width:${pct}%"></i></div></div>`; }).join("") : `<p class="muted">Todavía no cargaste metas. Elegí una y te muestro cuánto te falta.</p>`}</div>
    <form class="goal-form" id="goal-form">
      <label class="small muted" for="g-metric">Nueva meta</label>
      <select id="g-metric">${Object.entries(METRICAS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("")}</select>
      <div class="pair"><input id="g-target" inputmode="decimal" placeholder="Valor objetivo" required><button class="btn btn-small" type="submit">Guardar meta</button></div>
      <p id="g-msg" class="small muted" role="status"></p>
    </form>`;

  $("#goal-form").onsubmit = async (e) => {
    e.preventDefault();
    const k = $("#g-metric").value, m = METRICAS[k], raw = $("#g-target").value.trim();
    let target = m.time ? raw.split(":").reduce((a, b) => a * 60 + Number(b), 0) : Number(raw.replace(",", "."));
    if (!isFinite(target) || target <= 0) { $("#g-msg").textContent = m.time ? "Escribí el tiempo como mm:ss, por ejemplo 22:30." : "Escribí un número, por ejemplo 8000."; return; }
    const { error } = await db.from("goals").insert({ metric: k, label: m.label.replace(/ \(.*\)$/, ""), target, direction: m.dir });
    if (error) { $("#g-msg").textContent = "No se pudo guardar la meta: " + error.message; return; }
    renderProgreso();
  };
  view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { await db.from("goals").update({ active: false }).eq("id", b.dataset.del); renderProgreso(); }));
}

/* ---------- navegación ---------- */
const PANTALLAS = { hoy: renderHoy, futbol: renderFutbol, fuerza: renderFuerza, sueno: renderSueno, progreso: renderProgreso };
async function go(tab) {
  document.querySelectorAll(".tabs button").forEach((b) => (b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  view.innerHTML = `<p class="muted">Cargando…</p>`;
  try { await PANTALLAS[tab](); }
  catch (e) { view.innerHTML = `<div class="empty"><strong>No se pudieron cargar los datos.</strong>${esc(e.message || e)}<br>Revisá tu conexión y volvé a abrir la pestaña.</div>`; }
  window.scrollTo(0, 0);
  try { localStorage.setItem("tab", tab); } catch {}
}
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));

/* ---------- acceso ---------- */
async function start() {
  const { data } = await db.auth.getSession();
  if (data.session) {
    $("#login").hidden = true; $("#app").hidden = false;
    let tab = "hoy"; try { tab = localStorage.getItem("tab") || "hoy"; } catch {}
    go(PANTALLAS[tab] ? tab : "hoy");
  } else {
    $("#app").hidden = true; $("#login").hidden = false;
    $("#email").value = OWNER;
    $("#email-label").textContent = `Cuenta: ${OWNER}`;
  }
}
$("#toggle-pw").onclick = () => {
  const i = $("#password"), show = i.type === "password";
  i.type = show ? "text" : "password";
  $("#toggle-pw").textContent = show ? "Ocultar" : "Mostrar";
  $("#toggle-pw").setAttribute("aria-pressed", String(show));
};
let entrando = false;
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  if (entrando) return;
  entrando = true; $("#login-btn").disabled = true;
  $("#login-msg").textContent = "Entrando…";
  const { error } = await db.auth.signInWithPassword({ email: OWNER, password: $("#password").value });
  entrando = false; $("#login-btn").disabled = false;
  if (error) {
    $("#login-msg").textContent = /confirm/i.test(error.message)
      ? "Tu cuenta todavía no está confirmada. Avisale a Claude."
      : "La contraseña no coincide. Tocá Mostrar para revisar lo que escribiste. Si la creó el iPhone, la encontrás en Ajustes → Contraseñas, buscando mi-rendimiento.";
    return;
  }
  start();
};
start();
