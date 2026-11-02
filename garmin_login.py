"""Login inicial (se corre UNA vez en tu compu).

Inicia sesión en Garmin Connect (te pide el código MFA si lo tenés activado)
y guarda los tokens de sesión en tu base de Supabase, de donde los toma la
sincronización diaria. Tu contraseña de Garmin no se guarda en ningún lado.
"""
import shutil
import tempfile
from getpass import getpass

from garminconnect import Garmin

from common import Supabase, read_token_file


def main() -> None:
    print("=== Conectar Garmin con tu base de datos ===\n")
    url = input("URL de Supabase (https://....supabase.co): ").strip()
    key = getpass("Clave secreta de Supabase (no se ve al pegarla): ").strip()
    email = input("Email de Garmin Connect: ").strip()
    password = getpass("Contraseña de Garmin (no se ve al escribirla): ")

    folder = tempfile.mkdtemp(prefix="garmin_")
    try:
        client = Garmin(email, password, prompt_mfa=lambda: input("Código MFA de Garmin: ").strip())
        client.login(folder)
        name = client.get_full_name()
        tokens = read_token_file(folder)
        if not tokens:
            raise SystemExit("El login funcionó pero no se generaron tokens. Actualizá: pip install -U garminconnect")
        Supabase(url, key).save_tokens(tokens)
        print(f"\nListo, {name}. La sesión quedó guardada en Supabase.")
        print("Ya podés cerrar esta ventana y activar la sincronización en GitHub.")
    finally:
        # No dejamos copias de los tokens en tu compu.
        shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    main()
