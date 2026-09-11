# Selectable NVIDIA web demo

The live web demo offers **NVIDIA Nemotron Nano VL 8B** (default) and **NVIDIA Cosmos Reason1 7B**. Choose a model in the English header before starting an analysis. Selection takes effect on the next request. Changing it clears previous results while retaining the image and request. The choice belongs to the current page; reloading restores the default.

Guard ON and Guard OFF receive the same frozen image, request, and model profile. The selector stays disabled for the entire comparison. The backend validates the returned model profile, and the comparison rejects results from a different model. Mock mode retains fixed fixtures and has no model selector.

## Start locally

Prepare the pinned Prototype submodule, backend dependencies, GPU environments, and cached model weights as described in the [README](../README.md#nvidia-local-models). From the repository root, use separate terminals:

```bash
# 1. Host model gateway (one process, loopback only)
cd backend
.venv/bin/python -m model_gateway --port 8010
```

```bash
# 2. Demo HTTP/SSE backend
cd backend
LENSGUARD_RUNTIME=prototype PROTOTYPE_RUNTIME_URL=http://127.0.0.1:8010 \
  INFERENCE_TIMEOUT_SECONDS=300 \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# 3. Frontend; localhost permits camera access over HTTP
cd frontend
VITE_HTTPS=false VITE_API_BASE_URL=/api API_PROXY_TARGET=http://127.0.0.1:8000 \
  npm run dev -- --host 127.0.0.1
```

Open `http://localhost:5173`. For LAN camera access use the [HTTPS setup](development.md#https-for-camera-access). Docker runs only the Demo backend and frontend; keep the gateway on the host and use `docker-compose.live.yml`. The existing [systemd unit](../scripts/lensguard-prototype.service) now starts the gateway using `backend/.venv/bin/python`. After updating an installed unit, run `systemctl --user daemon-reload` and restart it when no analysis is active.

## Environments and GPU ownership

The gateway launches the unmodified Prototype in a separate Python environment for each model:

| Model profile | Default Python executable | Tested Transformers |
| --- | --- | --- |
| `nemotron-nano-vl-8b` | `~/venvs/lensguard-nemotron/bin/python` | 4.53.3 |
| `cosmos-reason1-7b` | `~/venvs/lensguard-vlm/bin/python` | 5.16.1 |

Set `NEMOTRON_PYTHON`, `COSMOS_PYTHON`, or `PROTOTYPE_DIR` in the **gateway process environment** to change these administrator-controlled paths. The default Prototype directory is the repository's `prototype` submodule. `--default-model cosmos-reason1-7b` changes the page default if needed. No client-supplied executable, model ID, or environment path is accepted.

Only one worker is resident at a time. A different model selection stops the gateway's own worker, waits for it to exit, and then starts the selected model on a private loopback port. Reusing the same model keeps it loaded. Health polling and changing the browser selector do not load models. Workers use offline Hugging Face caches; missing weights or dependencies produce errors without substituting another model.

The existing Prototype GPU preflight still requires 21,000 MiB free before loading and 4,096 MiB for resident inference, with no competing compute process. The gateway never terminates unrelated GPU workloads. Concurrent requests get HTTP 409 from the gateway; an accepted Demo run records a terminal failure and can be retried. Disconnecting a client does not allow a second request to switch the GPU while inference is still running. A failed load, timeout, or invalid model response releases the owned worker before another request starts. Model changes add startup and loading time; the Demo timeout defaults to 300 seconds, including gateway startup (45 seconds), inference (240 seconds), and worker cleanup.

## Health and request checks

```bash
curl http://127.0.0.1:8010/health
curl http://127.0.0.1:8000/api/health
```

The second response must have `runtime: prototype`. Its `prototype.models` contains exactly the two NVIDIA options, and `prototype.default_model` is `nemotron-nano-vl-8b`. An option's `available` flag checks for its executable and the Prototype server directory; actual model loading verifies the environment and cached weights. `prototype.model_profile` describes the worker currently serving the GPU, which may belong to another visitor's selection. Each run's `model_profile` records its own selection. GPU memory is whole-device telemetry, not a promise of capacity for a new load.

The gateway has no `/warmup` endpoint. A first analysis loads the chosen model. To smoke-test with a synthetic image:

```bash
curl --max-time 300 http://127.0.0.1:8010/v1/analyze \
  -F image=@/path/to/exit-sign.png -F 'user_request=Where is the exit?' \
  -F model_profile=nemotron-nano-vl-8b -F guard_enabled=true
```

Repeat with `model_profile=cosmos-reason1-7b`; inspect `model.profile`, the output, and policy rather than relying only on HTTP 200. Both models can report insufficient evidence or produce invalid output. Successful model switching does not establish perception accuracy. All external actions remain simulated. See the [API contract](api-contract.md) and [testing record](testing.md).
