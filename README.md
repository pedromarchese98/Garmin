# Garmin → Supabase → Claude

Sincroniza automáticamente los datos de tu Garmin (sueño, HRV, frecuencia cardíaca, estrés, Body Battery, pasos, entrenamientos) a tu base de datos **Garmin Salud** en Supabase, dos veces por día. Después podés preguntarle a Claude desde cualquier dispositivo.

```
Reloj → app Garmin Connect → (GitHub Actions, 07:17 y 20:47) → Supabase → Claude
```

La configuración se hace **una sola vez**: unos 20 minutos.

---

## Paso 1 — Copiá la clave secreta de Supabase

1. Entrá a <https://supabase.com/dashboard/project/mlpvtvgtkkzdhsqvqsck/settings/api-keys>
2. En **Secret keys**, copiá la clave (empieza con `sb_secret_...`). Si no hay ninguna, tocá **Create new secret key**.
3. Guardala en un lugar a mano, la vas a usar dos veces.

> ⚠️ Esta clave da acceso total a tu base. No la compartas ni la pegues en el código.

URL del proyecto: `https://mlpvtvgtkkzdhsqvqsck.supabase.co`

## Paso 2 — Repositorio de GitHub

Ya está listo: el código vive en este repositorio privado (`pedromarchese98/garmin`).

## Paso 3 — Cargá los secretos en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository secret**. Creá dos:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | `https://mlpvtvgtkkzdhsqvqsck.supabase.co` |
| `SUPABASE_SECRET_KEY` | la clave `sb_secret_...` del paso 1 |

## Paso 4 — Login de Garmin desde tu compu Windows (una sola vez)

1. Instalá Python 3.12 o más nuevo desde <https://www.python.org/downloads/>. En el instalador, **marcá "Add python.exe to PATH"**.
2. Descargá este repositorio a tu compu: botón verde **Code → Download ZIP**, y descomprimilo en Descargas.
3. Abrí **PowerShell** (tecla Windows → escribí "PowerShell") y corré:

```powershell
cd $HOME\Downloads\garmin-main
python -m pip install -r requirements.txt
python garmin_login.py
```

4. El script te va a pedir la URL y la clave de Supabase, tu email y contraseña de Garmin y, si lo tenés activado, el código MFA. La contraseña y la clave no se ven mientras las escribís: es normal.
5. Si ves `Listo, <tu nombre>. La sesión quedó guardada en Supabase.`, terminaste.

Tu contraseña de Garmin no se guarda en ningún lado: solo se guarda la sesión, y la sincronización la renueva sola.

## Paso 5 — Primera sincronización (traer tu historial)

1. En GitHub, pestaña **Actions** → **Sincronizar Garmin** → **Run workflow**.
2. En "Días hacia atrás" poné **90** → **Run workflow**.
3. Tarda unos minutos. Si termina en verde ✅, tus datos ya están en Supabase.

A partir de ahí corre solo todos los días a las **07:17** y **20:47** (hora Argentina).

---

## Qué se guarda

| Tabla | Contenido |
|---|---|
| `daily_metrics` | Una fila por día: pasos, minutos de intensidad, FC en reposo, estrés, Body Battery, sueño (fases y puntaje), HRV, SpO₂, respiración, Training Readiness, VO₂max, peso |
| `activities` | Cada entrenamiento: tipo, duración, distancia, FC, carga, Training Effect |
| `v_daily_insights` | Vista con promedios de 7 días, líneas de base personales (60 días), desvío de FC en reposo, banda normal de HRV, minutos semanales de actividad y relación carga aguda/crónica |
| `sync_log` | Registro de cada sincronización (ok o error) |

## Si algo falla

- **El workflow sale en rojo con un error de login o tokens**: la sesión de Garmin venció. Volvé a correr `python garmin_login.py` en tu compu (paso 4) y después **Run workflow**.
- **Error de `pip` o `python` no reconocido**: reinstalá Python marcando "Add python.exe to PATH".
- **Garmin cambió algo y dejó de funcionar**: actualizá la librería (`python -m pip install -U garminconnect`). Los datos ya guardados no se pierden.
- Si GitHub llega a desactivar el workflow programado por falta de actividad en el repo, entrá a **Actions** y reactivalo con un clic.
- Costo: nada. Cada corrida dura un par de minutos, muy por debajo de los minutos gratis que GitHub da para repos privados.

> Esto usa la API no oficial de Garmin Connect (librería `python-garminconnect`). Es para uso personal y puede romperse sin aviso si Garmin cambia su sistema.
