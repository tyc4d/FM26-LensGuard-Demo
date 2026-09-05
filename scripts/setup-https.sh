#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v mkcert >/dev/null 2>&1; then
  cat >&2 <<'HELP'
mkcert is required to generate trusted local HTTPS certificates.
macOS: brew install mkcert
       brew install nss   # if using Firefox
Linux: install mkcert with your package manager or its official release binary.
       Install certutil for browser trust (Debian/Ubuntu: libnss3-tools).
Official instructions: https://github.com/FiloSottile/mkcert#installation
Then rerun ./scripts/setup-https.sh.
HELP
  exit 1
fi

# Require a usable unicast IPv4 address. Never silently generate localhost-only
# certificates when LAN detection fails. Explicit LAN_IP handles VPNs/multiple NICs.
usable_ipv4() {
  awk -v address="$1" 'BEGIN {
    if (split(address, parts, ".") != 4) exit 1;
    for (i = 1; i <= 4; i++) {
      if (parts[i] !~ /^[0-9]+$/ || parts[i] > 255 || length(parts[i]) > 3 || (length(parts[i]) > 1 && substr(parts[i],1,1) == "0")) exit 1;
    }
    if (parts[1] == 0 || parts[1] == 127 || parts[1] >= 224 || (parts[1] == 169 && parts[2] == 254)) exit 1;
  }'
}

lan_ip="${LAN_IP:-}"
if [[ -z "$lan_ip" ]]; then
  case "$(uname -s)" in
    Linux)
      if command -v ip >/dev/null 2>&1; then
        lan_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}' || true)"
      fi
      ;;
    Darwin)
      lan_interface="$(route -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}' || true)"
      if [[ -n "$lan_interface" ]]; then
        lan_ip="$(ipconfig getifaddr "$lan_interface" 2>/dev/null || true)"
      fi
      ;;
  esac
fi

if ! usable_ipv4 "$lan_ip"; then
  echo 'No usable LAN IPv4 address was determined. Set LAN_IP explicitly:' >&2
  echo 'LAN_IP=<your-LAN-IPv4-address> ./scripts/setup-https.sh' >&2
  exit 1
fi

printf 'Generating a local certificate for LAN address %s.\n' "$lan_ip"
echo 'If this is a VPN or the wrong interface, rerun with LAN_IP set explicitly.'
if ! mkcert -install; then
  echo 'Could not install the mkcert CA. Resolve the reported trust-store permissions/dependencies and rerun this script.' >&2
  exit 1
fi

mkdir -p "$repo_root/certs"
umask 077
# Generate in a temporary directory so a failed mkcert call preserves prior files.
temp_certs="$(mktemp -d "$repo_root/certs/.generate.XXXXXX")"
trap 'rm -rf -- "$temp_certs"' EXIT
mkcert -cert-file "$temp_certs/lensguard.pem" -key-file "$temp_certs/lensguard-key.pem" \
  localhost 127.0.0.1 ::1 "$lan_ip"
mv -- "$temp_certs/lensguard.pem" "$repo_root/certs/lensguard.pem"
mv -- "$temp_certs/lensguard-key.pem" "$repo_root/certs/lensguard-key.pem"
chmod 600 "$repo_root/certs/lensguard-key.pem"
chmod 644 "$repo_root/certs/lensguard.pem"

printf '\nCertificates written to certs/. Open https://localhost:5173 or https://%s:5173.\n' "$lan_ip"
echo 'Start Vite with VITE_HTTPS=true, or Compose with HTTPS_ENABLED=true.'
echo 'Other LAN devices must separately trust this mkcert CA. See README.md.'
