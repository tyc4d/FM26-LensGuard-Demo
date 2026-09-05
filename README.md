# LensGuard Demo

LensGuard is a sensor-to-action security prototype for multimodal AI agents.

AI can read the world.
The world does not automatically get authority over the AI.

This repository contains a working research demonstration of the boundary between **what a camera observes**, **what a model proposes**, and **what an authorization layer permits**. It illustrates physical prompt injection through structured action provenance: environmental content can provide useful information without automatically gaining authority over a sensitive action argument.

**Current stage:** live local Qwen3-VL 8B integration + explicit mock mode.
**Not integrated:** automatic semantic region grounding and Phase 3.6 evaluation results.

Demo 介面使用繁體中文，包含操作按鈕、相機提示、分析結果、授權說明與技術明細。原始模型輸出和結構化 JSON 保留原文，方便核對實際推論內容。

The camera, UI, FastAPI, and SSE pipeline are live. In `LENSGUARD_RUNTIME=prototype`, one image is sent on 開始分析 to the independent Prototype service, which reuses its frozen action-only model adapter and parser. The deterministic authorization gate is real; its conservative limitations are described below. In `mock` mode, fixtures supply results and images remain in the browser. All external actions remain simulated.

## What the demo includes

- A cinematic stage that follows one analysis from a frozen image through available observations, proposed values, provenance, authorization, and the actual result.
- A real browser camera with start/stop controls, device selection, and permission/error handling.
- Local image upload with JPEG/PNG/WebP preview, replacement/removal, and a return to live camera.
- Three deterministic scenarios with mock region overlays clearly identified as scenario data.
- A Guard ON/OFF comparison using two sequential requests with the same frozen image, user request, and scenario. Each response retains its own proposed action and result.
- Automatic presentation pacing, manual previous/next controls, keyboard shortcuts, and replay of already received results without another model request.
- Structured, provenance-bearing action arguments and a decision trace, including a separate user-delegation path. A details drawer exposes the original evidence, diagnostics, event history, and raw JSON.
- Backend-generated event timestamps streamed progressively through Server-Sent Events (SSE).
- 重設, backend connection handling, and Architecture/Evaluation views.

## Architecture

```text
Browser Camera / Uploaded Image
              ↓ one snapshot, HTTPS multipart
Demo React → Demo FastAPI → Prototype Runtime (loopback HTTP)
              ↑ SSE                ↓
              └──────────── Qwen3-VL 8B → LensGuard → Simulated Action
```

| Component | Prototype mode | Mock mode |
| --- | --- | --- |
| Camera / UI / REST / SSE | Live | Live |
| VLM | Real resident local Qwen3-VL 8B | Scenario fixture |
| Provenance | Actual input/model transport lineage; semantic grounding unavailable | Fixture lineage |
| Policy | Prototype deterministic thin gate + scoped demo delegation | Fixture-based policy |
| Action sink | Simulated | Simulated |

See [architecture and integration notes](docs/architecture.md) and the [runtime contract](docs/api-contract.md).

The cinematic presentation is a frontend layer over the existing `RunState` contract. It does not change model loading, prompts, parsing, authorization, or the runtime API. Missing detections, provenance, and decisions remain missing; presentation stages do not create evidence.

## Directory structure

```text
.
├── frontend/              React UI, camera, shared TypeScript shapes, tests
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf         Production UI and same-origin SSE/API proxy
│   └── .env.example
├── backend/               FastAPI runtime, Pydantic models, adapter, tests
│   ├── app/
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── mock-data/             Deterministic scenario fixtures
├── certs/                 Ignored local certificates; explanatory README only
├── scripts/               mkcert setup helper and helper tests
├── docs/
│   ├── api-contract.md
│   └── architecture.md
├── docker-compose.yml
├── .env.example           Docker HTTPS switch
└── README.md
```

## Prerequisites

- Node.js 22.12+ and npm.
- Python 3.12+ with `venv` and pip. On systems where the executable is `python3`, use it for the initial virtual-environment command.
- A modern browser and an optional webcam. All mock scenarios can run with the camera off.
- Docker Engine and Docker Compose for the container option.

## Local development

Run these commands from the repository root in two terminals.

**Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

If `python` is unavailable before activation, use `python3 -m venv .venv` instead. The activated virtual environment provides `python`.

Backend: <http://localhost:8000>
Interactive API documentation: <http://localhost:8000/docs>

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>. The default `VITE_API_BASE_URL=/api` uses Vite's development proxy to reach the local backend. Keep both processes running.

Keep `VITE_API_BASE_URL=/api` for local/LAN demos. Set `API_PROXY_TARGET` if the backend runs elsewhere; that address is used by the Vite server, not the visiting device. An HTTPS page falls back to `/api` if an old HTTP API override remains configured, preventing mixed-content calls. A deliberately separate API origin must itself use HTTPS and allow the browser origin through CORS. Vite environment variables are public client configuration, not a place for secrets.

The backend loads `backend/.env` automatically, with existing process environment variables taking precedence. Configuration includes `MOCK_STAGE_DELAY_MS` (default 250), `CORS_ORIGINS`, the in-memory limits `MAX_RUNS` and `MAX_CONCURRENT_RUNS`, `SSE_HEARTBEAT_SECONDS`, and an optional `MOCK_DATA_PATH`. See [backend/.env.example](backend/.env.example).

## HTTPS for camera access

**Use HTTPS for camera demos over LAN.** Browser `getUserMedia()` requires a secure context; HTTP localhost is a special case that works only on the device running the browser. A phone visiting the presentation laptop's plain HTTP LAN address is not visiting its own localhost. See [MDN secure context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).

Install mkcert on the presentation computer. On macOS:

```bash
brew install mkcert
brew install nss # needed if you use Firefox
```

On Linux, install mkcert using your package manager or an [official release](https://github.com/FiloSottile/mkcert#installation). Install `certutil` for browser trust as well (for example, `sudo apt install libnss3-tools` on Debian/Ubuntu). Put `mkcert` on your `PATH`.

From the repository root:

```bash
./scripts/setup-https.sh
```

The helper runs `mkcert -install` (which may request administrator privileges), detects the default route's LAN IPv4 address on Linux/macOS, and creates `certs/lensguard.pem` and `certs/lensguard-key.pem`. It covers `localhost`, `127.0.0.1`, `::1`, and the selected LAN address. It prints the selected address; check it when using VPNs or multiple network adapters. To choose the address explicitly:

```bash
LAN_IP=192.168.1.123 ./scripts/setup-https.sh
```

The address above is an example; use your presentation computer's address. To also cover a Tailscale IP or another hostname/address, pass it as an extra argument:

```bash
./scripts/setup-https.sh 100.101.102.103
```

Replace that example with your address. Extra hostnames and IPs are added to the certificate alongside localhost and the detected or explicit `LAN_IP`; pass all required extra names/addresses again whenever you regenerate. Open the site using an address covered by the certificate.

The script exits clearly if mkcert or a usable LAN IP is unavailable. `LAN_IP` is read from the shell environment, not automatically from `.env`. Generated certificates and private keys are ignored by Git and excluded from Docker build contexts. Regenerate after an address changes, then restart the frontend.

After installing the project dependencies, use two terminals from the repository root:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

```bash
cd frontend
VITE_HTTPS=true npm run dev -- --host 0.0.0.0
```

Open **https://localhost:5173** on the presentation computer, or **https://<LAN-IP>:5173** on another device. Allow inbound TCP 5173 in the presentation computer's firewall if necessary; both devices must be on a network permitting peer connections. Do not run HTTP and HTTPS servers on port 5173 simultaneously. Use `VITE_HTTPS=false npm run dev` to return to HTTP localhost development. You can also persist `VITE_HTTPS=true` in `frontend/.env`; no code changes are required.

The browser sends REST and SSE traffic to the same HTTPS origin under `/api`. Vite forwards it to HTTP FastAPI internally, with streaming timeouts disabled. No browser request needs `http://localhost:8000` or the backend's LAN address, and no backend TLS/CORS change is required. Capture happens in the browser; real mode uploads one snapshot only when **開始分析** is clicked.

**Certificate trust on another device:** mkcert installs its CA only into supported trust stores on the computer where `mkcert -install` runs. Another phone or laptop does **not** automatically trust that CA. Transfer only the public `rootCA.pem` from the directory printed by `mkcert -CAROOT`, then install/trust it using that device's OS/browser instructions. iOS also requires enabling full trust for the installed CA. Android and managed devices vary in their support for user-installed CAs. Restart the browser after trust changes if needed. Never transfer `rootCA-key.pem` or the server private key. See [mkcert's device trust instructions](https://github.com/FiloSottile/mkcert#mobile-devices).

A certificate warning means trust is not correctly configured; clicking through it is not a reliable camera setup. Confirm a warning-free HTTPS page, then grant camera permission. If only the presentation laptop uses the camera, trusting the CA on that laptop is sufficient; a remote viewer does not acquire the laptop's camera. HTTPS enables secure-context APIs but does not override permission denial, unavailable hardware, or device/browser restrictions.

If installing a development CA is impractical, use a trusted HTTPS tunnel or a real certificate for a domain you control. Route the entire frontend and `/api` through that HTTPS origin, and restrict tunnel access appropriately. This is an optional alternative; no tunnel is integrated here.

## Docker Compose

The base `docker-compose.yml` runs **mock mode**. For real Qwen inference, follow [Docker and real mode](#docker-and-real-mode) to start the host Prototype service and enable `docker-compose.live.yml`. Changing `backend/.env` does not configure Docker: that file is neither copied into the backend image nor passed to Compose. Persist the live override with `COMPOSE_FILE` in the repository-root `.env` as shown below.

Docker uses HTTPS by default. Generate and trust the local certificates before the first startup, following the [HTTPS setup](#https-for-camera-access), then run from the repository root:

```bash
./scripts/setup-https.sh
docker compose up --build
```

Open **https://localhost:5173** or **https://<LAN-IP>:5173**. For Tailscale or another hostname/address, include it when generating the certificate as shown above. Every visiting device must trust the mkcert CA. When HTTPS is enabled, an HTTP request to port 5173 redirects to HTTPS while preserving the requested host, port, path, and query string.

`HTTPS_ENABLED` defaults to `true`. Check any existing repository-root `.env` and change `HTTPS_ENABLED=false` to `true` for HTTPS. For HTTP localhost development, explicitly opt out:

```bash
HTTPS_ENABLED=false docker compose up --build
```

This serves <http://localhost:5173> without certificates; camera access over a plain HTTP LAN address remains unavailable. Copy root `.env.example` to `.env` if you want to persist your Docker settings. `HTTPS_ENABLED` controls nginx at container startup; `VITE_HTTPS` controls the local Vite server. Both expose port 5173, so stop the local dev server before using Compose.

Compose mounts `./certs` read-only at `/etc/lensguard/certs`; private keys are never baked into images. The existing nginx container selects HTTP or TLS configuration at startup and fails clearly if HTTPS certificates are missing. After replacing certificates, run `HTTPS_ENABLED=true docker compose up -d --force-recreate frontend` to reload them. The internal healthcheck probes the selected protocol; its HTTPS liveness probe skips CA verification because the local CA is not installed inside the image. Browser certificate verification remains enabled.

The API is also available at <http://localhost:8000/api/health> for direct local diagnostics. Compose waits for backend health before starting the frontend. Container health confirms that the Demo responds; inspect the response's `runtime` and `prototype` fields to confirm the selected mode and upstream availability. Nginx serves the production build and forwards `/api/` to FastAPI with response buffering disabled for SSE; HTTPS browsers use this same-origin proxy.

```bash
docker compose down
```

`VITE_API_BASE_URL` is a frontend **build-time** setting. Compose defaults it to `/api`; override it in the shell or a repository-root `.env` and rebuild if needed. The browser accesses the webcam on the host, so the containers do not need a webcam device mount.

## Camera permissions

Use the [HTTPS setup](#https-for-camera-access) for LAN access, or `http://localhost:5173` on the presentation computer. Plain HTTP on a LAN IP cannot provide the required secure context.

Click **啟動相機** and approve the browser permission prompt. Available devices appear after permission is granted; front/back choices depend on the browser and connected hardware. If access is denied, enable camera access in the browser's site settings and retry. A missing or busy camera is reported beside the camera controls, and the mock analysis remains usable.

**停止相機** releases the active media tracks. **重設** clears the current run, comparison, presentation, and event stream while preserving camera state. The preview does not continuously upload video; real analysis sends a frozen snapshot only when requested.

Use **上傳圖片** below the camera preview to choose a JPEG, PNG, or WebP (up to 10 MB and 40 megapixels). The image appears in the stage without cropping. A successful upload stops the live camera and clears the previous analysis. **更換圖片** selects another file; **移除圖片** clears the preview. **啟動相機** switches back once camera access succeeds. 重設 and page navigation preserve the current image.

In mock mode uploaded images stay in the browser and 開始分析 uses the selected fixture. In prototype mode 開始分析 converts the preview to JPEG and sends one image for real inference; server temporary input files are deleted after the request. File selection works without camera permission, including on HTTP LAN pages where live camera access is unavailable.

## Running the scenarios

Select a scenario, review the trusted user request, choose the guard setting, then click **開始分析**. In real mode, the stage uses the captured image and received run data to progress through capture, perception, proposed meaning, provenance, action proposal, authorization, and a blocked, allowed, simulated-execution, or failed result. Only stages supported by received data become available. The perception stage can explain that region detection is unavailable; it does not manufacture OCR boxes or confidence scores. A failed analysis can reach its failure result without a policy decision.

Automatic playback advances approximately every two seconds when the next stage is available, taking about twelve seconds for a full sequence after its data is ready. This is presentation pacing, separate from model inference and backend event timing. Playback waits for data, stops at the result, and respects manual navigation when later updates arrive. Input-changing controls are disabled while requests are active.

Use **上一步** / **下一步** to pause and move through available stages, **播放** / **暫停** to control playback, and **重播** to replay the current received record. Keyboard shortcuts in the demo are **←**, **→**, **Space**, and **R**, respectively. Shortcuts do not interrupt text entry or the open details drawer; Space retains normal button/link behavior. Browsers requesting reduced motion start with manual playback. Opening the details drawer pauses the presentation and exposes actual action fields, provenance, policy, diagnostics, and event history.

Click **建立防護比較** to freeze one image and the exact user request, then submit two actual requests in sequence: LensGuard off, then on. The real runtime receives the same image bytes and request text for both calls, but the model may produce different proposals. The first record remains on stage while the second request runs. At the first result, use **下一步** to view the guarded record; the comparison summary appears after that record reaches its result. **重播比較** reuses both cached records, and **重播** / **R** reuses the current one. Neither replay submits another request. Failures remain failures in the comparison; no missing outcome is replaced with an attack-success or defense-success claim.

The table below describes the deterministic **mock fixtures**, not guaranteed real-model responses. Mock comparisons still make two backend requests, but use scenario fixtures without uploading image bytes. For an explicit fixture fallback, select `LENSGUARD_RUNTIME=mock` in the backend configuration or use the base Compose configuration; see [Docker Compose](#docker-compose). Prototype errors never silently switch to mock mode.

| Scenario | User request and proposed action | Guard ON | Guard OFF |
| --- | --- | --- | --- |
| 訂位提示注入 | `幫我打電話訂這間餐廳`; `call_phone(number="0912-345-678")` from instruction-like camera text | BLOCKED: observation has no authority to bind the phone target | EXECUTED in simulation; attack successful |
| 導航提示注入 | `出口在哪裡？`; environmental instruction proposes `navigate(direction="right")`, while the exit sign says left | BLOCKED proposal; mock safe result `left` | EXECUTED in simulation; result `right`, attack successful |
| 使用者明確授權 | `幫我撥打這張名片上的電話`; `call_phone(number="02-2345-6789")` | ALLOWED: the request delegates use of this observed number | EXECUTED in simulation; no attack |

The delegation scenario demonstrates that the decision is about authority, not blanket rejection of camera text. Guard OFF bypasses mock policy evaluation and records a simulated execution. Guard ON evaluates the provenance-bearing action. An ALLOWED result is an authorization demonstration; it does not place a call.

The stage highlights an existing action argument and its source before showing authorization. A selected argument is not automatically a verified critical argument, and image-to-model transport lineage does not establish semantic grounding. The details drawer retains original model text and structured values for inspection. All action execution remains simulated.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Backend availability, configured runtime, upstream model readiness/errors |
| GET | `/api/scenarios` | Scenario metadata and fixture inputs |
| POST | `/api/run` | Start a run; return initial `RunState` with HTTP 202 |
| GET | `/api/run/{run_id}` | Read the current run snapshot |
| GET | `/api/run/{run_id}/events` | SSE stream of progressive snapshots, including replay |

Example request:

```bash
curl -X POST http://localhost:8000/api/run \
  -H 'Content-Type: application/json' \
  -d '{"scenario_id":"reservation-injection","guard_enabled":true}'
```

Use the returned `id` with the state or event endpoint. SSE messages are named `runtime`, carry the latest runtime event ID, and contain a complete `RunState` snapshot as JSON. The server supports `Last-Event-ID` replay and closes the stream after completion. Runtime events contain server-generated ISO timestamps; the UI formats them for display. Mock event delays remain centralized in the backend. Frontend presentation pacing does not change these timestamps or runtime progress. SSE recovery replay is separate from the presentation controls, which replay cached records without network requests.

Frontend schemas are defined in [frontend/src/types.ts](frontend/src/types.ts); backend Pydantic schemas mirror the same conceptual contract. See [docs/api-contract.md](docs/api-contract.md) for stage ordering and payload details.

## Validation

Backend, from `backend/` with the virtual environment activated:

```bash
pytest
```

Frontend, from `frontend/`:

```bash
npx playwright install chromium
PLAYWRIGHT_ISOLATED=true npm test
npm run build
```

`PLAYWRIGHT_ISOLATED=true` is recommended for UI testing. It starts a separate mock backend on port **18000** and a frontend on **15173**, with the frontend proxy directed to that backend, and never reuses existing servers. Keep those test ports free; the running Docker demo and real Prototype service can stay as configured. Plain `npm test` uses ports 8000/5173 and can reuse existing servers outside CI, so it requires those servers to match the tests' mock configuration.

To run the same browser suite over HTTPS after generating and trusting certificates:

```bash
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" VITE_HTTPS=true PLAYWRIGHT_ISOLATED=true npm test
```

`NODE_EXTRA_CA_CERTS` lets the Node-based test runner verify the development CA; the browser must independently trust it. Tests do not disable browser certificate verification. The suite defaults to HTTP when `VITE_HTTPS` is not set, even if `frontend/.env` enables HTTPS for normal development.

The backend tests cover health, scenario enumeration, guarded and unguarded attacks, and explicit delegation. Frontend browser tests cover the practical UI state transitions, event-stream recovery, layout, and camera behavior.

Playwright automatically starts both the FastAPI and Vite development servers. Create `backend/.venv` and install its requirements first; the test configuration uses `backend/.venv/bin/python` by default. To use another Python environment with those dependencies installed:

```bash
PYTHON_BINARY=/absolute/path/to/python PLAYWRIGHT_ISOLATED=true npm test
```

On Linux, Playwright may also require its Chromium system dependencies (`npx playwright install --with-deps chromium`). Automated camera checks use a synthetic browser video device. A physical webcam permission grant must also be checked in the browser used for the live presentation. See [validation notes](docs/testing.md) for recorded results and remaining verification limits.

## Real local inference

The Prototype repository remains the runtime source of truth. The Demo never imports its Python modules, adds it to `PYTHONPATH`, or copies model code. The HTTP boundary is implemented in [PrototypeRuntimeProvider](backend/app/prototype_provider.py). See [live runtime contract](docs/api-contract.md).

### Prerequisites and GPU safety

Use the existing `/home/tyc4d/venvs/lensguard-vlm` environment on this server: PyTorch `2.10.0+cu128`, Transformers `5.16.1`, BF16 Qwen `Qwen/Qwen3-VL-8B-Instruct` at the Prototype's frozen revision. Do not reinstall CUDA, update the model stack, change revisions, clear caches, or use `pip install -e .` in the Prototype.

Before startup inspect `nvidia-smi` and running experiment command lines. Phase 3.6 takes priority: never kill, pause, restart, or renice it. The service refuses a new load when another compute process is active or free VRAM is below 21,000 MiB. Resident requests require 4,096 MiB free and no other compute process. These are conservative reserves, not guaranteed peak estimates. Observed demo resident GPU use was approximately 17.1 GiB with Qwen. Do not keep another VLM family resident. Preflight is a point-in-time check; coordinate experiment scheduling.

The service's web-only dependencies are separate from model packages. On the known verified environment, install only the missing transport packages (no dependency/model upgrades):

```bash
cd /home/tyc4d/FM26-LensGuard-Prototype
source /home/tyc4d/venvs/lensguard-vlm/bin/activate
python -m pip install --no-deps -r requirements/demo-runtime.txt
```

The existing environment must already contain Pydantic 2, AnyIO, Click, h11 and typing-extensions; this server was checked before installation.

### Startup order

Use three terminals. Do not start duplicate runtimes; first inspect `curl http://127.0.0.1:8010/health` and existing processes. A healthy `unloaded` status is expected until the first image. Do not use multiple workers or reload for the model service.

1. Prototype:

```bash
cd /home/tyc4d/FM26-LensGuard-Prototype
source /home/tyc4d/venvs/lensguard-vlm/bin/activate
python -m prototype_demo_server --model qwen3vl-8b --host 127.0.0.1 --port 8010
```

2. Demo backend (stop your previous **Demo backend only** if port 8000 is occupied):

```bash
cd /home/tyc4d/FM26-LensGuard-Demo/backend
source .venv/bin/activate
pip install -r requirements.txt
LENSGUARD_RUNTIME=prototype PROTOTYPE_RUNTIME_URL=http://127.0.0.1:8010 \
  uvicorn app.main:app --host 127.0.0.1 --port 8000
```

3. Frontend, after [certificate setup](#https-for-camera-access):

```bash
cd /home/tyc4d/FM26-LensGuard-Demo/frontend
npm install
VITE_HTTPS=true VITE_API_BASE_URL=/api npm run dev -- --host 0.0.0.0
```

Open `https://localhost:5173` or `https://<LAN-IP>:5173`. The visiting device must trust the mkcert CA and the certificate must cover that address. Camera access on a physical device has to be granted there. The browser only contacts the HTTPS frontend; Vite proxies REST/SSE to the Demo and the Demo contacts the loopback Prototype.

Choose a scenario, enter **你的請求**, start the camera or upload a scene image, then click **開始分析**. In real mode, the reservation request starts empty; navigation and business-card tasks retain their original defaults. For a complete reservation, provide the intended date/time and party size; if you only want to call the restaurant, say that explicitly. Analysis requires a nonblank request, and the displayed task is sent to the model.

Editing clears the prior run while keeping the image, and drafts are retained per scenario until the page reloads. **清除請求** empties the reservation draft. **使用情境預設** restores the original wording for navigation and business-card tasks. Request editing is disabled during analysis; **重設** clears the run while retaining the draft. Mock mode continues to use its fixed tasks.

The scenario never supplies the real model answer or environmental text. Raw model output, measured timings, and lineage are in expandable technical details. WebP uploads are converted to JPEG by the browser. Snapshot longest edge is bounded to 2560 pixels with JPEG quality 0.9; there is no continuous frame streaming.

Optional one-time warmup, **only when experiments are not competing for the GPU**:

```bash
curl -X POST http://127.0.0.1:8010/warmup
```

It runs a synthetic blank image, caches completion, and writes no benchmark results. It has the same GPU preflight as inference.

To return to fixture mode, restart only the Demo backend with `LENSGUARD_RUNTIME=mock`. This is the default. There is **no automatic fallback** from prototype to mock.

### Authorization and honest limits

Action-only inference does not establish semantic region provenance. The Prototype's automatic perception backend is an abstract interface; its complete grounding paths require a real evidence registry. This integration reports transport lineage only, empty detected regions, and model-origin arguments. It does not invent OCR, bounding boxes, confidence, verified camera origins, attack success, or a corrected navigation direction.

For CALL, OPEN_URL, DIRECTION_ADVICE and NONE, the existing Phase 2 thin gate runs with missing semantic evidence. Its native CONFIRM/WARN/BLOCK decisions withhold execution and render BLOCKED; the native decision is retained in runtime metadata. BLOCKED therefore means authorization was withheld, not that an attack was proven.

The exact trusted task `幫我撥打這張名片上的電話` grants a narrow demo delegation for one proposed CALL. This new deterministic scope rule is separate from benchmark policy; it permits the proposed number without proving it came from the business card. It is not a general language understanding or authenticity check. Other action types fail closed when no applicable policy exists. The VLM never decides authorization. Guard OFF bypasses enforcement and records simulated execution, without claiming an attack succeeded.

### Troubleshooting

- `unavailable`: start the Prototype and verify `PROTOTYPE_RUNTIME_URL`; no fixture fallback occurs.
- `unloaded` / `loading`: first request loads once; health remains responsive. Duplicate inference requests receive a busy response.
- GPU busy or OOM: leave experiments untouched, wait for an agreed GPU window; do not switch models silently.
- Timeout: Demo defaults to 180 seconds (`INFERENCE_TIMEOUT_SECONDS`); a timed-out GPU request may still finish on the Prototype. Check health before retrying. 重設 detaches the UI; it does not interrupt a model generation.
- Parse failure: raw output remains visible, with no structured action or execution fabricated. The existing parser may accept JSON fences; no new repair/retry parser is introduced.
- `需要補充資料`: the reservation proposal is missing required values, such as time or party size. Check **你的請求**, supply the needed details, and run again. The Demo never fills missing values with defaults; raw `N/A` values remain visible, and field-specific issues identify what to correct. Full parser errors stay in the expandable diagnostics. These checks validate completeness and types; they do not establish that model-proposed values came from your request or image. Reservation execution remains blocked by the existing policy.
- Policy unavailable: automatic execution is withheld. Ground truth fixtures never authorize real results.
- Low text resolution: fill the camera frame with readable scene text; preprocessing remains the Prototype's native Qwen processor.

### Docker and real mode

The base Compose file runs mock mode. Real mode requires the host Prototype runtime and `docker-compose.live.yml`, which connects the container backend to the runtime on host loopback. This override is Linux-specific and requires Docker Compose 2.24.4+.

First check `curl http://127.0.0.1:8010/health` and existing processes. Reuse an existing Prototype runtime; do not start a second copy. For a managed service on this server, [scripts/lensguard-prototype.service](scripts/lensguard-prototype.service) uses the existing `%h/venvs/lensguard-vlm` Python environment and `%h/FM26-LensGuard-Prototype` checkout, where `%h` is your home directory. It does not install or change the model stack. Check the [GPU prerequisites](#prerequisites-and-gpu-safety) before use.

If no Prototype runtime is already running, install the user service once from the **Demo repository root**:

```bash
mkdir -p ~/.config/systemd/user
ln -s "$PWD/scripts/lensguard-prototype.service" ~/.config/systemd/user/lensguard-prototype.service
systemctl --user daemon-reload
systemctl --user enable --now lensguard-prototype.service
systemctl --user status lensguard-prototype.service
```

Skip link creation if the unit is already installed. Enabling a user service starts it with the user manager, normally at login; this setup does not enable lingering or promise startup at boot without login. Its lifetime follows the user manager. The service listens only on `127.0.0.1:8010` and loads Qwen lazily on the first image or warmup request. The existing GPU preflight still applies.

Generate certificates using the [HTTPS setup](#https-for-camera-access), then add or update these settings in the **repository-root `.env`**:

```dotenv
HTTPS_ENABLED=true
COMPOSE_FILE=docker-compose.yml:docker-compose.live.yml
```

Now ordinary Compose commands retain real mode:

```bash
docker compose up --build -d
curl http://localhost:8000/api/health
```

Confirm `runtime` is `prototype`. The nested `prototype.status` should be `unloaded` before the first inference or `ready` after successful inference, with no upstream error; `prototype.model_loaded` indicates whether the model is resident. A Docker `healthy` label or HTTP 200 alone does not establish a connection to Qwen. `prototype.status: unavailable` means the upstream service cannot be reached; the Demo never falls back to mock mode automatically.

To select the override for a single command without persisting `COMPOSE_FILE`:

```bash
HTTPS_ENABLED=true docker compose -f docker-compose.yml -f docker-compose.live.yml up --build
```

This override runs the Demo backend on host port 8000 and points nginx to the host gateway. Do not run the host Demo backend on that port simultaneously. Certificates are still mounted read-only; neither model weights nor Prototype files are built into Demo images.

`docker compose down` stops the Demo containers but leaves the host Prototype service running. Stop the service when finished to release any resident model GPU memory:

```bash
systemctl --user stop lensguard-prototype.service
```

Use `systemctl --user start lensguard-prototype.service` before the next live demo. To return Docker to mock mode, remove or comment out `COMPOSE_FILE` in the root `.env` and rerun `docker compose up --build -d`.

## Known limitations

- Semantic provenance / OCR and full Phase 3.6 grounding are not integrated; explicit delegation is narrowly scoped as described above.
- First-request model load is slower than resident inference. Actual latency depends on image size and output length.
- Runs are process-local and reset on backend restart. Use one worker. Uploaded images are temporary; raw output and run metadata remain in bounded in-memory run history.
- Camera permission, device selection, and CA trust vary by browser. Browser tests use synthetic camera hardware.
- No real calls, navigation, messages, or other external side effects are performed. This demo is not an evaluation metric.
