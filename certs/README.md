# Local HTTPS certificates

From the repository root, run `./scripts/setup-https.sh` (requires mkcert).
It creates `lensguard.pem` and `lensguard-key.pem` here; both are ignored by Git.
The certificate covers localhost and the detected LAN IP; use
`LAN_IP=192.168.1.123 ./scripts/setup-https.sh` to select the LAN IP explicitly.
Pass additional hostnames or IPs as arguments, for example
`./scripts/setup-https.sh 100.101.102.103` to include a Tailscale IP. Replace the
example addresses with your own.

Vite reads them locally. Docker mounts this directory read-only at runtime;
certificates and keys are never copied into images.
Docker uses HTTPS by default, so generate these files before the first
`docker compose up --build`. For HTTP localhost development without certificates,
use `HTTPS_ENABLED=false docker compose up --build`.

Regenerate after a covered address changes, supplying all required extra
hostnames/IPs again, then restart Vite or recreate the frontend container with
`HTTPS_ENABLED=true docker compose up -d --force-recreate frontend`.
Every visiting device must trust the mkcert CA and use an address covered by
the certificate. Keep private keys private. The development
CA lives outside the repository in `mkcert -CAROOT`; only its public
`rootCA.pem` may be transferred to another device for trust installation.
Never share `rootCA-key.pem` or `lensguard-key.pem`.

See [HTTPS for camera access](../README.md#https-for-camera-access).
