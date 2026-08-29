#!/bin/bash
# Grünzeug – Server-Setup für den LXC 192.168.178.37
# Einmalig auf dem Container ausführen:  bash install.sh
set -e

ZIEL=/opt/gruenzeug

echo "==> Pakete installieren"
apt-get update -qq
apt-get install -y -qq nginx

echo "==> Verzeichnis anlegen"
mkdir -p "$ZIEL"
chown -R www-data:www-data "$ZIEL"

echo "==> Nginx-Site schreiben"
cat > /etc/nginx/sites-available/gruenzeug <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /opt/gruenzeug;
    index index.html;

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

echo "==> Konfiguration prüfen"
nginx -t

echo "==> Nginx starten"
systemctl enable nginx
systemctl restart nginx

echo ""
echo "✅ Fertig. Jetzt vom Laptop aus:  python deploy.py"
echo "   Danach im Nginx Proxy Manager einen Proxy Host anlegen:"
echo "   pflanzen.michaely.de → 192.168.178.37:80, SSL per Let's Encrypt, Force SSL an"
