"""Host-only NVIDIA model switching; owns one isolated Prototype worker at a time."""
import argparse
import asyncio
import logging
import os
import socket
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

DEFAULT_MODEL = 'nemotron-nano-vl-8b'
MAX_BYTES = 10 * 1024 * 1024
log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ModelProfile:
    name: str
    model_id: str
    python: Path


def model_profiles():
    environments = Path.home() / 'venvs'
    return {
        'nemotron-nano-vl-8b': ModelProfile('NVIDIA Nemotron Nano VL 8B',
            'nvidia/Llama-3.1-Nemotron-Nano-VL-8B-V1',
            Path(os.environ.get('NEMOTRON_PYTHON', environments / 'lensguard-nemotron/bin/python'))),
        'cosmos-reason1-7b': ModelProfile('NVIDIA Cosmos Reason1 7B',
            'nvidia/Cosmos-Reason1-7B',
            Path(os.environ.get('COSMOS_PYTHON', environments / 'lensguard-vlm/bin/python'))),
    }


class ModelGateway:
    def __init__(self, prototype_dir: Path, profiles=None, default_model=DEFAULT_MODEL,
                 startup_timeout=45, inference_timeout=240):
        self.prototype_dir = prototype_dir
        self.profiles = profiles if profiles is not None else model_profiles()
        if default_model not in self.profiles:
            raise ValueError('The default model must be configured.')
        self.default_model = default_model
        self.startup_timeout = startup_timeout
        self.inference_timeout = inference_timeout
        self.lock = asyncio.Lock()
        self.process = None
        self.current_model = None
        self.worker_url = None
        self.switching = False
        self.error = None

    def available(self, profile):
        return os.access(self.profiles[profile].python, os.X_OK) and (self.prototype_dir / 'prototype_demo_server').is_dir()

    async def health(self):
        profile = self.current_model or self.default_model
        result = {
            'status': 'switching' if self.switching else 'error' if self.error else 'unloaded',
            'model_loaded': False, 'model_profile': profile,
            'model_id': self.profiles[profile].model_id, 'error': self.error,
        }
        if not self.switching and self.process is not None and self.process.returncode is None:
            try:
                async with httpx.AsyncClient(timeout=1) as client:
                    response = await client.get(f'{self.worker_url}/health')
                    response.raise_for_status()
                    remote = response.json()
                if not isinstance(remote, dict) or remote.get('model_profile') != profile:
                    raise ValueError('Worker model mismatch')
                result.update(remote)
            except (httpx.HTTPError, ValueError):
                result.update(status='unavailable', error='The selected model service is unavailable.')
        elif self.process is not None and self.process.returncode is not None:
            result.update(status='unavailable', error='The selected model service stopped. Start a new analysis to retry.')
        result.update(default_model=self.default_model, models=[
            {'id': key, 'name': value.name, 'available': self.available(key)}
            for key, value in self.profiles.items()
        ])
        return result

    async def _stop_worker(self):
        # Only this gateway's child is stopped. Never reclaim another GPU process.
        process = self.process
        if process is not None and process.returncode is None:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=15)
            except ProcessLookupError:
                await process.wait()
            except TimeoutError:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                await process.wait()
        self.process = None
        self.worker_url = None

    async def _ensure_worker(self, profile):
        if self.current_model == profile and self.process is not None and self.process.returncode is None:
            return
        self.switching = True
        try:
            await self._stop_worker()
            self.current_model = profile
            # A private loopback port avoids disturbing separately managed services.
            with socket.socket() as listener:
                listener.bind(('127.0.0.1', 0))
                port = listener.getsockname()[1]
            self.worker_url = f'http://127.0.0.1:{port}'
            self.process = await asyncio.create_subprocess_exec(
                str(self.profiles[profile].python), '-m', 'prototype_demo_server',
                '--model', profile, '--host', '127.0.0.1', '--port', str(port),
                cwd=self.prototype_dir,
                env={**os.environ, 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'PYTHONUNBUFFERED': '1'},
            )
            deadline = asyncio.get_running_loop().time() + self.startup_timeout
            async with httpx.AsyncClient(timeout=1) as client:
                while asyncio.get_running_loop().time() < deadline:
                    if self.process.returncode is not None:
                        raise RuntimeError('The model worker exited during startup.')
                    try:
                        response = await client.get(f'{self.worker_url}/health')
                        response.raise_for_status()
                        remote = response.json()
                        if isinstance(remote, dict) and remote.get('model_profile') == profile:
                            return
                    except (httpx.HTTPError, ValueError):
                        pass
                    await asyncio.sleep(.2)
            raise RuntimeError('The model worker did not become ready in time.')
        except (OSError, RuntimeError) as exc:
            await self._stop_worker()
            log.exception('Unable to start %s', profile)
            raise HTTPException(503, 'The selected model could not start. Check its environment and cached weights.') from exc
        finally:
            self.switching = False

    async def _infer(self, profile, data, content_type, fields):
        self.error = None
        try:
            await self._ensure_worker(profile)
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.inference_timeout, connect=5)) as client:
                response = await client.post(f'{self.worker_url}/v1/analyze',
                    files={'image': ('frame.png' if content_type == 'image/png' else 'frame.jpg', data, content_type)},
                    data=fields)
            if response.is_success:
                payload = response.json()
                model = payload.get('model') if isinstance(payload, dict) else None
                if not isinstance(model, dict) or model.get('profile') != profile:
                    raise HTTPException(502, 'The model response did not match the selected model.')
            elif response.status_code >= 500:
                # A failed load can leave partial weights allocated in the worker.
                await self._stop_worker()
            return Response(content=response.content, status_code=response.status_code,
                            media_type='application/json')
        except httpx.TimeoutException as exc:
            # A timed-out worker may still be generating; release it before unlocking.
            await self._stop_worker()
            self.error = 'The selected model timed out. Start a new analysis to retry.'
            raise HTTPException(504, self.error) from exc
        except (httpx.HTTPError, ValueError) as exc:
            await self._stop_worker()
            self.error = 'The selected model service failed. Start a new analysis to retry.'
            raise HTTPException(503, self.error) from exc
        except HTTPException as exc:
            await self._stop_worker()
            self.error = exc.detail
            raise

    async def analyze(self, profile, data, content_type, fields):
        profile = profile or self.default_model
        if profile not in self.profiles:
            raise HTTPException(422, 'Choose NVIDIA Nemotron or Cosmos.')
        if not self.available(profile):
            raise HTTPException(503, 'The selected model environment is not installed.')
        if self.lock.locked():
            raise HTTPException(409, 'A model is loading or analyzing. Wait for it to finish and try again.')
        async with self.lock:
            # Client cancellation must not allow another request to switch a busy GPU.
            task = asyncio.create_task(self._infer(profile, data, content_type, fields))
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                try:
                    await task
                finally:
                    raise

    async def close(self):
        async with self.lock:
            await self._stop_worker()


def create_app(gateway=None):
    gateway = gateway if gateway is not None else ModelGateway(
        Path(os.environ.get('PROTOTYPE_DIR', Path(__file__).resolve().parents[1] / 'prototype')))

    @asynccontextmanager
    async def lifespan(app):
        yield
        await gateway.close()

    app = FastAPI(title='LensGuard NVIDIA Model Gateway', lifespan=lifespan)

    @app.get('/health')
    async def health():
        return await gateway.health()

    @app.post('/v1/analyze')
    async def analyze(image: UploadFile = File(...), user_request: str = Form(..., min_length=1, max_length=4000),
                      scenario_id: str | None = Form(None), mode: str = Form('action_only'),
                      guard_enabled: bool = Form(True), model_profile: str | None = Form(None)):
        if not user_request.strip() or mode != 'action_only':
            raise HTTPException(422, 'Provide a nonempty request in action_only mode.')
        content_type = image.content_type
        data = await image.read(MAX_BYTES + 1)
        await image.close()
        if content_type not in ('image/jpeg', 'image/png'):
            raise HTTPException(422, 'Use a JPEG or PNG image.')
        if not data or len(data) > MAX_BYTES:
            raise HTTPException(413, 'Image must be nonempty and at most 10 MiB.')
        return await gateway.analyze(model_profile, data, content_type, {
            'user_request': user_request, 'scenario_id': scenario_id or '',
            'mode': mode, 'guard_enabled': str(guard_enabled).lower(),
        })

    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Serve selectable NVIDIA models using one GPU.')
    parser.add_argument('--port', type=int, default=8010)
    parser.add_argument('--default-model', choices=list(model_profiles()), default=DEFAULT_MODEL)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    gateway = ModelGateway(Path(os.environ.get('PROTOTYPE_DIR', Path(__file__).resolve().parents[1] / 'prototype')),
                           default_model=args.default_model)
    uvicorn.run(create_app(gateway), host='127.0.0.1', port=args.port, workers=1)
