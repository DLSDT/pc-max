#!/usr/bin/env bash
# One-time Cloudflare Tunnel setup for PC MAX API — run this AFTER
# `cloudflared tunnel login` has completed (needs ~/.cloudflared/cert.pem).
#
# Creates a tunnel, points api.pcmax.rixy.ir at the local API container
# (localhost:4000), and installs cloudflared as a systemd service so the
# tunnel survives reboots.
set -euo pipefail

TUNNEL_NAME="pcmax-api"
HOSTNAME="api.pcmax.rixy.ir"
LOCAL_SERVICE="http://localhost:4000"

if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "❌ Not logged in yet. Run 'cloudflared tunnel login' first, then re-run this script." >&2
  exit 1
fi

if ! cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "→ Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID=$(cloudflared tunnel list -o json | python3 -c "
import json,sys
data = json.load(sys.stdin)
match = [t for t in data if t['name'] == '$TUNNEL_NAME']
print(match[0]['id'] if match else '')
")

if [ -z "$TUNNEL_ID" ]; then
  echo "❌ Could not find tunnel id after creation." >&2
  exit 1
fi

mkdir -p "$HOME/.cloudflared"
cat > "$HOME/.cloudflared/config.yml" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${HOME}/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: ${HOSTNAME}
    service: ${LOCAL_SERVICE}
  - service: http_status:404
EOF

echo "→ Routing DNS: ${HOSTNAME} -> tunnel ${TUNNEL_ID}"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" || echo "  (already routed, continuing)"

echo "→ Installing cloudflared as a systemd service (needs sudo)..."
sudo cloudflared service install

echo "✅ Done. Check status with: sudo systemctl status cloudflared"
echo "   Once the API container is running, https://${HOSTNAME} should be live."
