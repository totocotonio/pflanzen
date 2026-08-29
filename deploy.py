#!/usr/bin/env python3
"""Deploy der Grünzeug-PWA zum LXC-Container.

    python deploy.py          nur die statischen Dateien
    python deploy.py --api    zusätzlich das Backend, danach Dienst-Neustart
"""
import os
import subprocess
import sys

HOST = "192.168.178.37"
USER = "root"
KEY = r"C:\Users\Torst\.ssh\id_ed25519"

STATISCH_ZIEL = "/opt/gruenzeug/"
STATISCH = [
    "index.html", "app.js", "style.css", "sw.js", "manifest.json",
    "favicon.svg", "favicon.ico", "apple-touch-icon.png",
    "icon-192.png", "icon-512.png", "icon-maskable.png",
]

API_ZIEL = "/opt/gruenzeug-api/"
API = ["main.py", "push.py", "cron.py", "manage.py", "requirements.txt",
       "gruenzeug.service", "gruenzeug-push.service", "gruenzeug-push.timer",
       "install_api.sh"]

mit_api = "--api" in sys.argv
script_dir = os.path.dirname(os.path.abspath(__file__))

try:
    import paramiko
except ImportError:
    print("Installiere paramiko...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko


def lauf(ssh, befehl):
    _, out, err = ssh.exec_command(befehl)
    code = out.channel.recv_exit_status()
    text = (out.read() + err.read()).decode(errors="replace").strip()
    return code, text


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Verbinde mit {HOST}...")
ssh.connect(HOST, username=USER, key_filename=KEY)

lauf(ssh, f"mkdir -p {STATISCH_ZIEL}")
sftp = ssh.open_sftp()

for f in STATISCH:
    local = os.path.join(script_dir, f)
    if not os.path.exists(local):
        print(f"  Übersprungen (fehlt): {f}")
        continue
    print(f"  Upload: {f} → {STATISCH_ZIEL}{f}")
    sftp.put(local, STATISCH_ZIEL + f)

if mit_api:
    lauf(ssh, f"mkdir -p {API_ZIEL}")
    for f in API:
        local = os.path.join(script_dir, "server", f)
        print(f"  Upload: server/{f} → {API_ZIEL}{f}")
        # Shell-Skripte brauchen Unix-Zeilenenden
        if f.endswith((".sh", ".service")):
            daten = open(local, "rb").read().replace(b"\r\n", b"\n")
            with sftp.open(API_ZIEL + f, "wb") as ziel:
                ziel.write(daten)
        else:
            sftp.put(local, API_ZIEL + f)

sftp.close()

if mit_api:
    print("Starte Dienst gruenzeug neu...")
    code, text = lauf(ssh, "systemctl restart gruenzeug && sleep 1 && systemctl is-active gruenzeug")
    print("  Status:", text or code)

ssh.close()
print("✅ Grünzeug aktualisiert – Seite neu laden (Service Worker!)")
