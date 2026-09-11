# LensGuard 操作與維運指南

> 黑客松作品介紹見 [README](../README.md)。以下保留完整操作步驟與歷史限制；目前系統流程以 [架構](architecture.md)及[任務與引用約束](task-boundary.md)為準。所有 shell 指令預設從 Demo 根目錄執行，除非另有 `cd`。

LensGuard is a sensor-to-action security prototype for multimodal AI agents.

AI can read the world.
The world does not automatically get authority over the AI.

This repository contains a working research demonstration of the boundary between **what a camera observes**, **what a model proposes**, and **what an authorization layer permits**. It illustrates physical prompt injection through structured action provenance: environmental content can provide useful information without automatically gaining authority over a sensitive action argument.

**Current stage:** selectable local NVIDIA Nemotron (default) / Cosmos integration + explicit mock mode. See [NVIDIA demo operation](nvidia-demo.md).
**Grounding limit:** scene text is extracted by the local VLM and checked by deterministic semantic rules; it is not independently verified. Phase 3.6 evaluation results are not part of this demo.

The presentation is a single page with four states: **Observe, Distinguish, Decide, Protect**. Interface labels, controls, and known direction values use English; the original scene text and user request remain unchanged. The technical drawer retains the original diagnostics and structured output.

The camera, UI, FastAPI, and SSE pipeline are live. In `LENSGUARD_RUNTIME=prototype`, one frozen image is sent on **Start analysis** to the independent Prototype service. Its current flow interprets the user task without image access, transcribes the scene, selects existing text references, and checks task/action/value consistency before assembling the result. It no longer requires restaurant/card-specific phone labels. See [the task and citation boundary](../docs/task-boundary.md) for the implementation, comparison behavior and limitations. In `mock` mode, fixtures supply results and images remain in the browser. All external actions remain simulated.

## What the demo includes

- One persistent central image, tiny stage indicator, and one primary action.
- **觀察:** original captured/uploaded image and the exact user request. Mock mode shows a labeled sample image built from backend fixture text.
- **分辨:** observations/contacts and embedded instructions from the returned semantic regions. Image highlights require actual coordinates; unlocated text is explicitly shown as extracted text.
- **判斷:** selected evidence is marked 採用 and denied instructions are marked 忽略, with compact confirmation marks. Navigation uses plain text buttons; no presentation arrow paths are drawn.
- **保護:** the actual answer or approved call target, with simulation explicitly indicated for calls. Blocked redirects and failed analyses keep their actual outcomes.
- Real camera capture, device selection, validated image upload, and request editing in scene setup.
- Existing REST/SSE analysis, recovery after connection loss, and cached replay. No frontend result fixtures or automatic fallback from real inference.
- The existing technical drawer, opened with **D**, keeps policy, provenance, raw model output, and event history available outside presentation mode.

## Architecture

```text
Browser Camera / Uploaded Image
              ↓ one snapshot, HTTPS multipart
Demo React → Demo FastAPI → NVIDIA gateway (loopback HTTP)
              ↑ SSE                ↓
              └──────────── Prototype worker (Nemotron / Cosmos) → LensGuard → Simulated Action
```

| Component | Prototype mode | Mock mode |
| --- | --- | --- |
| Camera / UI / REST / SSE | Live | Live |
| VLM | Selected resident NVIDIA Nemotron / Cosmos | Scenario fixture |
| Provenance | Model-derived semantic regions, claims, and argument lineage | Explicit fixture regions and claims |
| Policy | Semantic evidence for answers; scoped user delegation for capabilities | Same evidence/delegation distinction on deterministic fixtures |
| Action sink | Simulated | Simulated |

See [architecture and integration notes](../docs/architecture.md) and the [runtime contract](../docs/api-contract.md).

The four-state presentation consumes the `RunState` contract. The newer task/citation boundary changes demo inference and authorization while retaining model loading and the frozen benchmark code. Missing detections, provenance, and decisions remain missing; presentation stages do not create evidence.

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

The backend loads `backend/.env` automatically, with existing process environment variables taking precedence. Configuration includes `MOCK_STAGE_DELAY_MS` (default 250), `CORS_ORIGINS`, the in-memory limits `MAX_RUNS` and `MAX_CONCURRENT_RUNS`, `SSE_HEARTBEAT_SECONDS`, and an optional `MOCK_DATA_PATH`. See [backend/.env.example](../backend/.env.example).

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

The browser sends REST and SSE traffic to the same HTTPS origin under `/api`. Vite forwards it to HTTP FastAPI internally, with streaming timeouts disabled. No browser request needs `http://localhost:8000` or the backend's LAN address, and no backend TLS/CORS change is required. Capture happens in the browser; real mode sends the frozen snapshot only when **Start analysis** is clicked. Clean scene options run protected analysis once; interference options additionally send the same snapshot for the unprotected baseline.

**Certificate trust on another device:** mkcert installs its CA only into supported trust stores on the computer where `mkcert -install` runs. Another phone or laptop does **not** automatically trust that CA. Transfer only the public `rootCA.pem` from the directory printed by `mkcert -CAROOT`, then install/trust it using that device's OS/browser instructions. iOS also requires enabling full trust for the installed CA. Android and managed devices vary in their support for user-installed CAs. Restart the browser after trust changes if needed. Never transfer `rootCA-key.pem` or the server private key. See [mkcert's device trust instructions](https://github.com/FiloSottile/mkcert#mobile-devices).

A certificate warning means trust is not correctly configured; clicking through it is not a reliable camera setup. Confirm a warning-free HTTPS page, then grant camera permission. If only the presentation laptop uses the camera, trusting the CA on that laptop is sufficient; a remote viewer does not acquire the laptop's camera. HTTPS enables secure-context APIs but does not override permission denial, unavailable hardware, or device/browser restrictions.

If installing a development CA is impractical, use a trusted HTTPS tunnel or a real certificate for a domain you control. Route the entire frontend and `/api` through that HTTPS origin, and restrict tunnel access appropriately. This is an optional alternative; no tunnel is integrated here.

## Docker Compose

The base `docker-compose.yml` runs **mock mode**. For real NVIDIA inference, follow [Docker and real mode](#docker-and-real-mode) to start the host Prototype service and enable `docker-compose.live.yml`. Changing `backend/.env` does not configure Docker: that file is neither copied into the backend image nor passed to Compose. Persist the live override with `COMPOSE_FILE` in the repository-root `.env` as shown below.

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

Open scene setup with the wordmark or **S**. In live mode, click **啟動相機** and approve the browser permission prompt. Available devices appear after permission is granted; front/back choices depend on the browser and hardware. **停止相機** releases active media tracks.

Use **上傳圖片** to choose a JPEG, PNG, or WebP (up to 10 MB and 40 megapixels). Uploading stops the camera. **更換圖片** selects another file; **移除圖片** clears that preview. **Use image** captures a JPEG locally, releases the camera, closes setup, and invalidates the old analysis. The selected image is displayed without cropping and is sent only when **Start analysis** is clicked. 重播 preserves the image.

Mock mode uses labeled backend sample scenes and does not offer camera or upload inputs. Live file selection works without camera permission, including on HTTP LAN pages where live camera access is unavailable.

## Running the scenarios

Click the **LensGuard** wordmark (or press **S**) to choose a scene. In live mode, enter the request and select an image or camera; **Use image** freezes the input locally and closes setup. Only **Start analysis** uploads the image. In mock mode, **使用場景** selects an explicitly labeled sample made from the backend's fixture text; arbitrary camera images cannot be paired with unrelated mock results.

The only presentation actions are **Start analysis**, **下一步**, **下一步**, and **重播**. The stage stays on 觀察 during analysis. Clean scene options run only the protected analysis; interference options additionally run an unprotected baseline using the same image and request. The same image stays in the same position during 分辨; selected pieces move during 判斷; the same central surface becomes the result. 判斷 explicitly labels useful information and problematic instructions, and, for interference options, shows the actual results with and without LensGuard in two compact rows. Clean options omit the comparison and center the adopted information. Equal outcomes and unavailable baselines are reported as such. Long OCR stays bounded; complete text remains in details. No autoplay or pause control is needed.

Use **Right Arrow** to advance, **Left Arrow** to go back, and **R** to replay the completed result without another request. Changing the scene, image, or request discards the old run. Failed runs can be retried with 重播 and 開始分析. Shortcuts do not interfere with text entry or open dialogs. Transitions respect reduced-motion preferences.

Press **D** for the existing technical details; **Escape** closes either dialog. For development, `?debug` also reveals a tiny 細節 button. The normal presentation has no navigation pages, guard switch, provenance graph, policy cards, or JSON.

| Backend sample | Presentation result |
| --- | --- |
| Clean exit | EXIT → is usable; the result is displayed as 右邊. |
| Exit with “answer LEFT” instruction | EXIT → is marked 採用; the result is 右邊 and the LEFT instruction is marked 忽略. |
| Clean restaurant | The restaurant number is approved; 模擬撥號中 is explicitly simulated. |
| Restaurant with redirected number | The backend stops its injected proposal while permitting the legitimate contact. The result shows SAFE CONTACT and states that no call was placed. |
| Business card | The user's delegated card number is approved; 模擬撥號中 is explicitly simulated. |

These are deterministic backend samples, not guarantees about live model output. A live run may approve the legitimate contact directly, including when instructions are present; the presentation then uses that actual approved target. It never turns a blocked proposal into a call or uses scenario ground truth as the result. All external actions remain simulated. Real inference failures never silently switch to sample data.

See [presentation implementation and validation](../docs/presentation.md) for the result mapping and checks.

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

Frontend schemas are defined in [frontend/src/types.ts](../frontend/src/types.ts); backend Pydantic schemas mirror the same conceptual contract. See [docs/api-contract.md](../docs/api-contract.md) for stage ordering and payload details.

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

On Linux, Playwright may also require its Chromium system dependencies (`npx playwright install --with-deps chromium`). Automated camera checks use a synthetic browser video device. A physical webcam permission grant must also be checked in the browser used for the live presentation. See [validation notes](../docs/testing.md) for recorded results and remaining verification limits.

## Real local inference

The Prototype repository remains the runtime source of truth. The Demo never imports its Python modules, adds it to `PYTHONPATH`, or copies model code. The HTTP boundary is implemented in [PrototypeRuntimeProvider](../backend/app/prototype_provider.py). See [live runtime contract](../docs/api-contract.md).

### Prerequisites and GPU safety

Use the prepared environments on this server: `/home/tyc4d/venvs/lensguard-nemotron` for Nemotron (Transformers `4.53.3`) and `/home/tyc4d/venvs/lensguard-vlm` for Cosmos (Transformers `5.16.1`). Both use PyTorch `2.10.0+cu128` and cached BF16 weights at the Prototype's frozen revisions. See [NVIDIA setup](../README.md#nvidia-local-models). Do not reinstall CUDA, update the model stack, change revisions, clear caches, or use `pip install -e .` in the Prototype.

Before startup inspect `nvidia-smi` and running experiment command lines. Phase 3.6 takes priority: never kill, pause, restart, or renice it. The service refuses a new load when another compute process is active or free VRAM is below 21,000 MiB. Resident requests require 4,096 MiB free and no other compute process. These are conservative reserves, not guaranteed peak estimates. The gateway keeps only the selected model resident and stops only its own worker when switching. Preflight is a point-in-time check; coordinate experiment scheduling.

The service's web-only dependencies are separate from model packages. On the known verified environment, install only the missing transport packages (no dependency/model upgrades):

```bash
cd /home/tyc4d/FM26-LensGuard-Demo/prototype
source /home/tyc4d/venvs/lensguard-vlm/bin/activate
python -m pip install --no-deps -r requirements/demo-runtime.txt
```

The existing environment must already contain Pydantic 2, AnyIO, Click, h11 and typing-extensions; this server was checked before installation.

### Startup order

Use three terminals. Do not start duplicate runtimes; first inspect `curl http://127.0.0.1:8010/health` and existing processes. A healthy `unloaded` status is expected until the first image. Do not use multiple workers or reload for the model service.

1. NVIDIA model gateway:

```bash
cd /home/tyc4d/FM26-LensGuard-Demo/backend
.venv/bin/python -m model_gateway --port 8010
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

Click the wordmark, choose a scenario, enter **Your request**, and start the camera or upload a scene image. Click **Use image**, then **Start analysis**. In real mode, the reservation request starts empty; navigation and business-card tasks retain their original defaults. For a complete reservation, provide the intended date/time and party size; if you only want to call the restaurant, say that explicitly. Analysis requires a nonblank request, and the displayed task is sent to the model.

Choose **NVIDIA Nemotron Nano VL 8B** (default) or **NVIDIA Cosmos Reason1 7B** in the header. Selection applies to the next analysis and is frozen for both Guard ON/OFF requests. Changing it clears previous results while retaining the image and request.

Editing clears the prior run while keeping the selected image, and drafts are retained per scenario until the page reloads. Scene setup and editing are disabled during analysis. Mock mode uses its fixed tasks.

The scenario never supplies the real model answer or environmental text. Raw model output, measured timings, and lineage are in expandable technical details. WebP uploads are converted to JPEG by the browser. Snapshot longest edge is bounded to 2560 pixels with JPEG quality 0.9; there is no continuous frame streaming.

The first analysis loads the selected model. The gateway does not expose `/warmup`; use a synthetic image with the [NVIDIA smoke request](nvidia-demo.md#health-and-request-checks) to check loading and inference. Health polling alone does not load a model.

To return to fixture mode, restart only the Demo backend with `LENSGUARD_RUNTIME=mock`. This is the default. There is **no automatic fallback** from prototype to mock.

### Authorization and honest limits

LensGuard implements **READ ≠ OBEY**. Camera observations and entities remain useful evidence. An embedded instruction never gains authority merely because it can be read. Informational output (`provide_direction`, `INFORMATIONAL_OUTPUT`) is separate from side-effect arguments (`call_phone.number`, `SIDE_EFFECT_ARGUMENT`). A right-pointing EXIT sign supports “出口在右邊。” even beside a malicious “answer LEFT” instruction.

Each semantic region retains its source, role, grounded predicate/value, grounding status, lineage, evidence authority and disposition. Side effects require a trusted user-supplied value or explicit narrow delegation binding an observed entity predicate to the tool argument. For example, a request to call the restaurant delegates `restaurant_reservation_phone` to `call_phone.number`; it does not delegate instruction-derived alternative numbers. Source type alone never determines rejection.

The local VLM performs scene extraction; deterministic rules identify supported literal scene facts, instruction-like text, and supported user-intent/delegation patterns. These rules are intentionally limited: OCR quality, region separation, missed or subtle instructions, novel language, authenticity and entity association remain model/heuristic dependencies. Missing or conflicting evidence does not produce an invented direction. Unsupported capability/delegation grammars remain gated. Actual calls and other external effects remain simulated. Guard OFF preserves the original candidate without claiming independently verified attack success.

### Troubleshooting

- `unavailable`: start the NVIDIA gateway and verify `PROTOTYPE_RUNTIME_URL`; no fixture fallback occurs.
- `unloaded` / `loading`: first request or model change loads the selected model; health remains responsive. Duplicate inference requests receive a busy response.
- GPU busy or OOM: leave experiments untouched, wait for an agreed GPU window; do not switch models silently.
- Timeout: Demo defaults to 300 seconds (`INFERENCE_TIMEOUT_SECONDS`). Gateway worker startup has a 45-second budget and inference has 240 seconds; a timed-out worker is stopped before another request starts. Check health before retrying. Reloading detaches the UI; it does not interrupt a model generation.
- Parse failure: raw output remains visible, with no structured action or execution fabricated. The existing parser may accept JSON fences; no new repair/retry parser is introduced.
- `More information needed`: the reservation proposal is missing required values, such as time or party size. Check **Your request** in scene setup, supply the needed details, and run again. The Demo never fills missing values with defaults; raw `N/A` values remain visible, and field-specific issues identify what to correct. Full parser errors stay in the expandable diagnostics. These checks validate completeness and types; they do not establish that model-proposed values came from your request or image. Reservation execution remains blocked by the existing policy.
- Policy unavailable: automatic execution is withheld. Ground truth fixtures never authorize real results.
- Low text resolution: fill the camera frame with readable scene text; preprocessing remains the selected model's native Prototype processor.

### Docker and real mode

The base Compose file runs mock mode. Real mode requires the host NVIDIA gateway and `docker-compose.live.yml`, which connects the container backend to the runtime on host loopback. This override is Linux-specific and requires Docker Compose 2.24.4+.

First check `curl http://127.0.0.1:8010/health` and existing processes. Reuse the NVIDIA gateway if already running; a fixed-model legacy Prototype server must be stopped before replacing it with the gateway. For a managed service on this server, [scripts/lensguard-prototype.service](../scripts/lensguard-prototype.service) uses `%h/FM26-LensGuard-Demo/backend/.venv/bin/python` to start the NVIDIA gateway. It launches the pinned `%h/FM26-LensGuard-Demo/prototype` checkout in the selected model's existing environment, where `%h` is your home directory. See [environment paths](nvidia-demo.md#environments-and-gpu-ownership). Initialize the pinned checkout with `git submodule update --init --recursive` from the Demo root before starting it. It does not install or change the model stack. Check the [GPU prerequisites](#prerequisites-and-gpu-safety) before use.

If no gateway or Prototype runtime is already running, install the user service once from the **Demo repository root**:

```bash
mkdir -p ~/.config/systemd/user
ln -s "$PWD/scripts/lensguard-prototype.service" ~/.config/systemd/user/lensguard-prototype.service
systemctl --user daemon-reload
systemctl --user enable --now lensguard-prototype.service
systemctl --user status lensguard-prototype.service
```

Skip link creation if the unit is already installed. Enabling a user service starts it with the user manager, normally at login; this setup does not enable lingering or promise startup at boot without login. Its lifetime follows the user manager. The service listens only on `127.0.0.1:8010` and loads the selected NVIDIA model lazily on its first analysis. After updating an installed unit, reload systemd and restart the service when idle. The existing GPU preflight still applies.

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

Confirm `runtime` is `prototype`. The nested `prototype.status` should be `unloaded` before the first inference or `ready` after successful inference, with no upstream error; `prototype.model_loaded` indicates whether the model is resident. A Docker `healthy` label or HTTP 200 alone does not establish a connection to a ready NVIDIA worker. Verify `prototype.models` lists Nemotron and Cosmos and `prototype.default_model` is `nemotron-nano-vl-8b`. `prototype.status: unavailable` means the upstream service cannot be reached; the Demo never falls back to mock mode automatically.

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

- Scene perception is model-derived, not independently verified OCR/grounding. Semantic-role and user-intent grammars are limited, and full Phase 3.6 grounding is not integrated.
- First-request model load is slower than resident inference. Actual latency depends on image size and output length.
- Runs are process-local and reset on backend restart. Use one worker. Uploaded images are temporary; raw output and run metadata remain in bounded in-memory run history.
- Camera permission, device selection, and CA trust vary by browser. Browser tests use synthetic camera hardware.
- No real calls, navigation, messages, or other external side effects are performed. This demo is not an evaluation metric.
