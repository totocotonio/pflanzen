#!/bin/bash
# Grünzeug API – Setup auf dem LXC 192.168.178.37
# Einmalig ausführen:  bash install_api.sh
# Danach Benutzer anlegen:  cd /opt/gruenzeug-api && venv/bin/python manage.py adduser <name>
set -e

ZIEL=/opt/gruenzeug-api
STATISCH=/opt/gruenzeug

echo "==> Pakete"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip nginx

echo "==> Verzeichnis $ZIEL"
mkdir -p "$ZIEL"

echo "==> Virtuelle Umgebung"
if [ ! -d "$ZIEL/venv" ]; then
    python3 -m venv "$ZIEL/venv"
fi
"$ZIEL/venv/bin/pip" install -q --upgrade pip
"$ZIEL/venv/bin/pip" install -q -r "$ZIEL/requirements.txt"

echo "==> systemd-Service"
cp "$ZIEL/gruenzeug.service" /etc/systemd/system/gruenzeug.service
cp "$ZIEL/gruenzeug-push.service" /etc/systemd/system/gruenzeug-push.service
cp "$ZIEL/gruenzeug-push.timer" /etc/systemd/system/gruenzeug-push.timer
systemctl daemon-reload
systemctl enable gruenzeug
systemctl restart gruenzeug
systemctl enable --now gruenzeug-push.timer

echo "==> Nginx-Site (statische Dateien + /api an die App)"
cat > /etc/nginx/sites-available/gruenzeug <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /opt/gruenzeug;
    index index.html;

    # ^~ schlägt die Regex-Location für Assets, damit /api/... nie dort landet
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8500;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;

        # Antworten der API dürfen nirgends zwischengespeichert werden
        add_header Cache-Control "no-store" always;
        client_max_body_size 16m;
    }

    # Service Worker und Manifest nie cachen, sonst hängen Clients auf alten Versionen fest
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires -1;
    }
    location = /manifest.json {
        add_header Cache-Control "no-cache";
        default_type application/manifest+json;
    }
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # Assets mit ?v=-Parameter dürfen lange liegen bleiben
    location ~* \.(css|js|png|ico|svg|webp|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 512;

    access_log /var/log/nginx/gruenzeug.access.log;
    error_log  /var/log/nginx/gruenzeug.error.log;
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/gruenzeug /etc/nginx/sites-enabled/gruenzeug
nginx -t
systemctl reload nginx

echo ""
systemctl --no-pager --lines=0 status gruenzeug | head -4
echo ""
echo "Fertig. Jetzt einen Benutzer anlegen:"
echo "  cd $ZIEL && venv/bin/python manage.py adduser <name>"
