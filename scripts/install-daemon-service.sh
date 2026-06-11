#!/bin/zsh
# Installe le daemon CHASSIS comme service permanent macOS (launchd).
#
# Pourquoi un bundle : launchd n'a pas le droit de lire ~/Desktop (TCC).
# On bundle donc le daemon en un seul fichier JS déployé dans
# ~/Library/Application Support/chassis/, avec son propre data/.
#
#   ./scripts/install-daemon-service.sh            # installe + démarre
#   ./scripts/install-daemon-service.sh --remove   # désinstalle
set -euo pipefail

REPO="${0:a:h:h}"
APP="$HOME/Library/Application Support/chassis"
PLIST="$HOME/Library/LaunchAgents/work.chassis.daemon.plist"
LABEL="work.chassis.daemon"
LOG="$HOME/Library/Logs/chassis-daemon.log"
NODE="$(command -v node)"

if [[ "${1:-}" == "--remove" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Service désinstallé (les données restent dans $APP)."
  exit 0
fi

# 1. Bundle (un seul fichier, aucune dépendance au repo à l'exécution)
mkdir -p "$APP/data/history"
"$REPO/node_modules/.pnpm/node_modules/.bin/esbuild" "$REPO/apps/daemon/src/main.ts" \
  --bundle --platform=node --format=esm \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --outfile="$APP/daemon.mjs" --log-level=warning

# 2. Secrets + historique de calibration (jamais dans le repo)
[[ -f "$REPO/.env.daemon" ]] && cp "$REPO/.env.daemon" "$APP/.env.daemon"
cp "$REPO/apps/daemon/data/history/"*.json "$APP/data/history/" 2>/dev/null || true

# 3. Lanceur
cat > "$APP/start.sh" <<EOF
#!/bin/zsh
set -euo pipefail
cd "$APP"
if [[ -f .env.daemon ]]; then set -a; source .env.daemon; set +a; fi
export CHASSIS_DATA_DIR="$APP/data"
exec "$NODE" "$APP/daemon.mjs"
EOF
chmod +x "$APP/start.sh"

# 4. Service launchd (démarre au login, relance en cas de crash)
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$APP/start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "✓ Daemon installé et démarré."
echo "  inbox  : $APP/data/inbox/"
echo "  logs   : $LOG"
echo "  retirer: $0 --remove"
