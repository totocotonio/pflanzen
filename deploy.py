#!/usr/bin/env python3
"""Deploy der Grünzeug-PWA zum LXC-Container."""
import os
import subprocess
import sys

HOST = "192.168.178.37"
USER = "root"
KEY = r"C:\Users\Torst\.ssh\id_ed25519"
REMOTE = "/opt/gruenzeug/"
FILES = [
    "index.html", "app.js", "style.css", "sw.js", "manifest.json",
    "favicon.svg", "favicon.ico", "apple-touch-icon.png",
    "icon-192.png", "icon-512.png", "icon-maskable.png",
]

script_dir = os.path.dirname(os.path.abspath(__file__))

try:
    import paramiko
except ImportError:
    print("Installiere paramiko...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"])
    import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Verbinde mit {HOST}...")
ssh.connect(HOST, username=USER, key_filename=KEY)

ssh.exec_command(f"mkdir -p {REMOTE}")[1].channel.recv_exit_status()

sftp = ssh.open_sftp()
for f in FILES:
    local = os.path.join(script_dir, f)
    if not os.path.exists(local):
        print(f"  Übersprungen (fehlt): {f}")
        continue
    print(f"  Upload: {f} → {REMOTE}{f}")
    sftp.put(local, REMOTE + f)
sftp.close()
ssh.close()
print("✅ Grünzeug aktualisiert – Seite neu laden (Service Worker!)")
