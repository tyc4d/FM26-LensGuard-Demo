# Docker HTTPS validation — 2026-09-05

- Reproduced the reported failure: the running frontend had `HTTPS_ENABLED=false`, and an HTTPS request failed with OpenSSL `wrong version number`. The existing certificate also omitted the Tailscale IP used by the visiting browser.
- Built the frontend Docker image successfully (TypeScript + Vite production build), regenerated the certificate with both LAN and Tailscale addresses using the existing local CA, and recreated the frontend. Both Compose services are healthy; the default frontend now uses HTTPS.
- Verified certificate chains and hostnames with curl using the public CA explicitly, without `--insecure`, on localhost, the LAN IP, and the Tailscale IP. The same-origin `/api/health` endpoint returned the mock runtime on all three addresses.
- HTTP GET/HEAD and POST requests return a **308** redirect preserving the host, external port, path, and query string. `nginx -t` and the container HTTPS healthcheck passed.
- **29 Playwright tests passed** against the running Docker frontend/backend over trusted HTTPS, including progressive SSE, same-origin API calls, synthetic camera playback, uploads, and UI flows. Real-runtime browser tests use intercepted responses; this run did not invoke the Prototype service or model.
- A separate Chromium check followed HTTP to HTTPS on the Tailscale IP, confirmed `window.isSecureContext`, played a synthetic camera stream, and reached the API without certificate bypasses, page errors, or mixed-content messages. This check ran on the server itself, not a separate physical device.
- Isolated containers verified that default/explicit HTTPS without certificates and invalid HTTPS settings fail clearly. Explicit HTTP mode without certificates passed its healthcheck and proxied the API.
- **8 certificate-helper tests passed**, covering additional IP/DNS names, option rejection, help without dependencies, and the existing generation/failure cases. Shell syntax, default/live Compose configuration, and `git diff --check` passed.

To repeat the browser suite against Docker after starting the HTTPS containers, run from `frontend/`:

```bash
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" VITE_HTTPS=true npm test
```

Outside CI the Playwright configuration reuses the healthy services on ports 8000 and 5173. The browser must independently trust the same CA. Physical camera permission and CA trust on each visiting device still require checks there.

# Real local integration validation — 2026-09-05

- Prototype service and affected adapter/parser/gate regressions: **92 passed**, CPU fake-adapter suite.
- Demo backend: **35 passed**, including multipart forwarding, native decision mapping, SSE order, parse failure, timeout/unavailable, policy absence, and no mock fallback.
- HTTPS Playwright: **28 passed**, including synthetic camera-to-JPEG upload and uploaded-image-to-JPEG upload; no unsolicited POSTs.
- Production build passed (TypeScript + Vite).
- Default and Linux real-mode Compose configuration validated. The later Docker HTTPS validation above verifies container execution in mock mode; real-mode container inference remains unverified.
- Real Gemma 3 4B smoke passed: first request ~7.98 s including load, ~1.55 s inference; warmed requests ~0.95–0.98 s. Pinned revision and BF16 retained. GPU initially 15 / 24,564 MiB; resident ~9,013 MiB; peak torch allocation 8,866,027,008 bytes.
- Actual HTTPS browser → multipart → Demo → Prototype → Gemma → SSE → ALLOWED confirmed with a temporary local business-card image. Raw CALL output visible, secure context true, no mixed-content requests, no page errors, no horizontal overflow at 1600×1000.
- Real HTTP/SSE end-to-end also returned BLOCKED (native CONFIRM for missing evidence) and Guard OFF EXECUTED. These are authorization/integration checks, not proof of attack prevention.
- No active Phase 3.6 process was observed at either pre-load inspection. No existing research process was stopped, paused or modified. No model-stack versions changed. Validation-only real services were then stopped; final GPU usage was 15 MiB with 24,095 MiB reported free and no compute processes. Existing mock development servers remain available.
- Physical webcam access was **not** tested. Browser camera tests use Chromium's synthetic device. LAN devices still require trusted HTTPS certificates.

## Earlier mock/HTTPS validation

# Validation notes

Validation date: 2026-09-05.

These checks validate the UI and deterministic mock runtime. They do not measure LensGuard security efficacy or Phase 3.6 model performance.

## Recorded status

| Check | Result |
| --- | --- |
| Backend test suite | 27 tests passed |
| Frontend production build | Passed: TypeScript and Vite |
| Frontend Playwright suite, HTTP localhost (prior transport validation) | 18 tests passed |
| Frontend Playwright suite, restyled UI and image upload over trusted HTTPS localhost | 25 tests passed; browser certificate verification enabled |
| Certificate helper | 5 tests passed; real mkcert generation and LAN detection also verified |
| HTTPS LAN IP access | Secure context, synthetic camera playback, same-origin API and 7 SSE events verified |
| Docker Compose configuration | Passed in HTTP and HTTPS modes |
| nginx HTTPS configuration | Entrypoint rendering checked; native nginx served production UI, API and progressive SSE over HTTPS |
| Docker image build and container startup | Passed in the later Docker HTTPS validation above |
| Physical webcam | Requires a check on the presentation device; automated browser camera tests use synthetic media |

## Reproduce backend validation

From the repository root, after installing the backend requirements:

```bash
cd backend
source .venv/bin/activate
pytest
```

The suite covers health and scenario enumeration; deterministic outcomes for all three scenarios and guard states; progressive, timestamped snapshots; SSE replay and terminal streams; schema/input validation; provider failure; and bounded in-memory run handling.

## Reproduce frontend validation

First create `backend/.venv` and install `backend/requirements.txt` as described in the README. Then:

```bash
cd frontend
npm install
npx playwright install chromium
npm test
npm run build
```

The Playwright configuration starts FastAPI on port 8000 and Vite on port 5173. Outside CI it reuses running servers. Tests use `http://localhost:5173` and the default same-origin `/api` development proxy. The backend interpreter defaults to `backend/.venv/bin/python`; override it with `PYTHON_BINARY=/absolute/path/to/python npm test` if the installed dependencies live elsewhere.

For HTTPS, generate and trust the certificates using the README setup, stop any HTTP server on port 5173, then run from `frontend/`:

```bash
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" VITE_HTTPS=true npm test
```

The browser suite uses `https://localhost:5173` in this mode. It does not set `ignoreHTTPSErrors`, and it checks `window.isSecureContext`, same-origin API URLs, progressive SSE, and absence of mixed-content console messages. A separate browser check against the actual LAN IP also passed with certificate verification enabled. This was a LAN-address check from the same host, not a test on a physical secondary device.

For this unprivileged validation host, mkcert was built from its upstream v1.4.4 module and NSS tools were extracted locally. The test CA was installed into the user's NSS browser trust store using `TRUST_STORES=nss`; system-wide CA trust was not changed. Curl and Node verified the certificate using that public CA explicitly. Normal presentation setup uses `mkcert -install` with its supported host trust stores, as documented in the README.

Run certificate-helper tests from the repository root:

```bash
python3 scripts/test_https_setup.py
```

These tests use a stub mkcert in temporary directories and cover missing tools, explicit SAN inputs, private-key permissions, invalid/missing LAN addresses, and failed regeneration preserving existing certificates. Actual generated SANs were independently inspected with OpenSSL. Git ignores both generated PEM files.

Browser coverage includes scenario switching, guarded and unguarded results, explicit delegation, event ordering, structured action JSON, provenance traces, reset during a run, backend interruption and recovery, navigation placeholders, and viewport overflow.

The restyled Live Demo was visually reviewed at 1440×900 and 1920×1080, plus a 390px mobile width. Tests verify large visible primary controls, the distinct Chinese outcome headlines, all four technical sections being collapsed by default, their retained content after expansion, no interface emojis, and the non-attack outcome when delegation runs with the guard disabled. The 1920×1080 layout keeps the full central stage in view; expandable evidence remains below it. Camera lifecycle, HTTPS, REST, and progressive SSE tests continue to pass. No backend API contract changed for this restyling.

Seven camera tests cover actual synthetic stream playback, denied permission, a missing device, cancellation while permission is pending, preserving the stream across Reset and navigation tabs, recovery when a media track ends, and front/back selection. They use Chromium's synthetic video device; they do not establish that a particular physical webcam works.

Five upload tests cover local preview without network transfer, mock analysis and Reset/navigation retention, replacement/removal and object URL cleanup, camera/image switching, invalid/oversized/corrupt file handling, and use without a secure camera context. The image upload feature does not change the backend contract or introduce real image inference.

On Linux hosts missing browser libraries, `npx playwright install --with-deps chromium` installs the browser dependencies when system package installation is available. The test command reports missing libraries if those requirements have not been met.

## Container review

`docker compose config --quiet` and `HTTPS_ENABLED=true docker compose config --quiet` succeed. Review confirmed:

- The backend uses the repository root as its build context, copies `backend/app` and `mock-data`, and resolves its default fixture path to `/app/mock-data/scenarios.json`.
- The backend runs one Uvicorn worker as a non-root user. Its healthcheck uses the standard library and requires no additional executable.
- The frontend build has a lockfile and includes the Linux musl optional packages required by the Alpine Node image.
- Nginx serves HTTP or HTTPS on container port 8080, mapped to host port 5173. `HTTPS_ENABLED` selects the startup configuration. `/api/` preserves its path when forwarded to `backend:8000`.
- The SSE proxy disables buffering and caching and permits idle time longer than the backend heartbeat interval.
- Compose waits for backend health before starting the UI. The frontend healthcheck uses the image's BusyBox `wget` with the selected protocol. The HTTPS liveness probe skips local CA verification; browser verification is unaffected.
- Certificates mount read-only and are excluded from image build contexts. The nginx entrypoint rejects missing HTTPS certificates and invalid HTTPS mode values.
- Root and frontend `.dockerignore` rules exclude local environments, dependencies, builds, and test artifacts from their respective build contexts.

The earlier validation could not access the Docker daemon, so it used a local, unprivileged nginx 1.24 process with adapted test paths, port, and upstream hostname to verify HTTPS, API health, and progressive SSE. The Docker HTTPS validation recorded at the top of this file now verifies the actual nginx 1.28 container image and startup. No Docker socket permissions or system packages were changed for these checks.

On a host with a working Docker daemon, verify the complete container path using:

```bash
./scripts/setup-https.sh
HTTPS_ENABLED=true docker compose up --build
```

Open <https://localhost:5173>, run the three scenarios and Guard OFF comparison, and confirm the timeline updates progressively. The browser owns camera access; no container camera device mount is required. No physical camera hardware was available on this validation host.
