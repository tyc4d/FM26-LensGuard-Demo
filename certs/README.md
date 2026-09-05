# Local HTTPS certificates

From the repository root, run `./scripts/setup-https.sh` (requires mkcert).
It creates `lensguard.pem` and `lensguard-key.pem` here; both are ignored by Git.
Vite reads them locally. Docker mounts this directory read-only at runtime;
certificates and keys are never copied into images.

Regenerate after the presentation computer's LAN IP changes, then restart Vite
or recreate the frontend container. Keep private keys private. The development
CA lives outside the repository in `mkcert -CAROOT`; only its public
`rootCA.pem` may be transferred to another device for trust installation.
Never share `rootCA-key.pem` or `lensguard-key.pem`.

See [HTTPS for camera access](../README.md#https-for-camera-access).
