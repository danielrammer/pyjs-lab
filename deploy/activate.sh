#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/dnl/pyjs
STAGE=/home/dnl/tact/nginx/ancora.cyou.conf
LIVE=/etc/nginx/sites-available/ancora.cyou.conf
RELEASE="${1:?Pass the uploaded release name}"
[[ "$RELEASE" =~ ^[0-9]{8}-[0-9]{6}$ ]] || exit 2
test -f "$ROOT/releases/$RELEASE/index.html"
test -f "$ROOT/releases/$RELEASE/app.bundle.js"
test -f "$ROOT/releases/$RELEASE/nicegui-dist/PYJS-MANIFEST.json"
test -f "$ROOT/releases/$RELEASE/nicegui-dist/entrypoint.py"
mkdir -p "$ROOT/backups" "$ROOT/acme" "$ROOT/tls" "$ROOT/certbot-work" "$ROOT/certbot-logs"
cp "$LIVE" "$ROOT/backups/nginx-$RELEASE.conf"
cp "$STAGE" "$ROOT/backups/staged-nginx-$RELEASE.conf"
PREVIOUS=$(readlink "$ROOT/current" || true)

# Only replace our marked section. Preserve all existing Ancora, API, GONG,
# Cassiopeia, and EXIT configuration, including changes made outside this repo.
python3 - "$LIVE" "$ROOT/base-nginx.conf" <<'PY'
import pathlib, re, sys
source = pathlib.Path(sys.argv[1]).read_text()
source = re.sub(r'(?ms)^# BEGIN PYJS\n.*?^# END PYJS\n?', '', source)
if re.search(r'server_name\s+[^;]*\bpyjs\.ancora\.cyou\b', source):
    raise SystemExit('Unmarked PYJS configuration exists; inspect before deploying.')
pathlib.Path(sys.argv[2]).write_text(source.rstrip() + '\n\n')
PY

APPLIED=0
rollback() {
    if [[ "$APPLIED" == 1 ]]; then
        cp "$ROOT/backups/nginx-$RELEASE.conf" "$STAGE"
        sudo -n /bin/cp "$STAGE" "$LIVE"
        sudo -n /usr/sbin/nginx -t && sudo -n /bin/systemctl reload nginx
    fi
    cp "$ROOT/backups/staged-nginx-$RELEASE.conf" "$STAGE"
    if [[ -n "$PREVIOUS" ]]; then
        ln -sfn "$PREVIOUS" "$ROOT/current"
        if [[ -f "$PREVIOUS/learn_server.py" ]]; then docker compose -f "$ROOT/compose.yaml" up -d --force-recreate; fi
    fi
}
trap 'rollback' ERR

apply_config() {
    cat "$ROOT/base-nginx.conf" "$1" > "$STAGE"
    sudo -n /bin/cp "$STAGE" "$LIVE"
    APPLIED=1
    sudo -n /usr/sbin/nginx -t
    sudo -n /bin/systemctl reload nginx
}

check_editor() {
    # Nginx reload starts new workers asynchronously; wait for the new vhost.
    for attempt in {1..20}; do
        if curl -fsS "$@" > "$ROOT/check-response.html" && grep -q 'id="editor"' "$ROOT/check-response.html"; then return 0; fi
        sleep 0.5
    done
    echo 'The configured domain did not return the PYJS editor.' >&2
    return 1
}

ln -sfn "$ROOT/releases/$RELEASE" "$ROOT/current"
mkdir -p "$ROOT/data"
chmod 600 "$ROOT/learn.env"
docker compose -f "$ROOT/compose.yaml" up -d --force-recreate
for attempt in {1..30}; do
    if curl -fsS http://127.0.0.1:3192/api/learn > /dev/null; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:3192/api/learn > /dev/null
if [[ ! -f "$ROOT/tls/live/pyjs.ancora.cyou/fullchain.pem" ]]; then
    apply_config "$ROOT/pyjs.http.conf"
    check_editor -H 'Host: pyjs.ancora.cyou' http://127.0.0.1/
    certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
        --config-dir "$ROOT/tls" --work-dir "$ROOT/certbot-work" --logs-dir "$ROOT/certbot-logs" \
        --webroot -w "$ROOT/acme" -d pyjs.ancora.cyou
fi
apply_config "$ROOT/pyjs.https.conf"
check_editor --resolve pyjs.ancora.cyou:443:127.0.0.1 https://pyjs.ancora.cyou/

cat > "$ROOT/renew-certificate.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
certbot renew --quiet --config-dir /home/dnl/pyjs/tls \
    --work-dir /home/dnl/pyjs/certbot-work --logs-dir /home/dnl/pyjs/certbot-logs \
    --deploy-hook 'sudo -n /bin/systemctl reload nginx'
SH
chmod 750 "$ROOT/renew-certificate.sh"
crontab -l > "$ROOT/backups/crontab-$RELEASE.txt" 2>/dev/null || true
{ grep -vF '/home/dnl/pyjs/renew-certificate.sh' "$ROOT/backups/crontab-$RELEASE.txt" || true;
  echo '17 3 * * * /home/dnl/pyjs/renew-certificate.sh >> /home/dnl/pyjs/certbot-logs/renew.log 2>&1';
} | crontab -
trap - ERR
echo "Published release $RELEASE at https://pyjs.ancora.cyou"
