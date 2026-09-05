#!/bin/sh
set -eu

case "${HTTPS_ENABLED:-true}" in
  true)
    if [ ! -r /etc/lensguard/certs/lensguard.pem ] || [ ! -r /etc/lensguard/certs/lensguard-key.pem ]; then
      echo 'HTTPS_ENABLED=true requires certificates. Run ./scripts/setup-https.sh and mount ./certs read-only at /etc/lensguard/certs.' >&2
      exit 1
    fi
    LENSGUARD_TLS_LISTEN=' ssl'
    LENSGUARD_TLS_CONFIG='ssl_certificate /etc/lensguard/certs/lensguard.pem;
    ssl_certificate_key /etc/lensguard/certs/lensguard-key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    error_page 497 =308 https://$http_host$request_uri;'
    ;;
  false)
    LENSGUARD_TLS_LISTEN=''
    LENSGUARD_TLS_CONFIG=''
    ;;
  *) echo 'HTTPS_ENABLED must be true or false.' >&2; exit 1 ;;
esac
export LENSGUARD_TLS_LISTEN LENSGUARD_TLS_CONFIG
# Substitute only our variables: preserve nginx $host, $uri, $scheme, etc.
envsubst '${LENSGUARD_TLS_LISTEN} ${LENSGUARD_TLS_CONFIG}' \
  < /etc/nginx/lensguard.conf.template > /etc/nginx/conf.d/default.conf
