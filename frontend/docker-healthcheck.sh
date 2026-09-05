#!/bin/sh
set -eu
if [ "${HTTPS_ENABLED:-false}" = true ]; then
  # Liveness check only: the image intentionally does not contain the local CA.
  exec wget --quiet --tries=1 --no-check-certificate --spider https://127.0.0.1:8080/
fi
exec wget --quiet --tries=1 --spider http://127.0.0.1:8080/
