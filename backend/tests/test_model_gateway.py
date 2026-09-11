import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import model_gateway
from model_gateway import DEFAULT_MODEL, ModelGateway, ModelProfile, create_app

COSMOS = 'cosmos-reason1-7b'


@pytest.fixture
def gateway(tmp_path, monkeypatch):
    (tmp_path / 'prototype_demo_server').mkdir()
    profiles = {key: ModelProfile(key, f'nvidia/{key}', Path(sys.executable)) for key in (DEFAULT_MODEL, COSMOS)}
    gateway = ModelGateway(tmp_path, profiles=profiles)
    gateway.activity = []
    gateway.requests = []
    gateway.inference_handler = None
    gateway.spawn_failure = False

    class Process:
        def __init__(self, profile):
            self.profile = profile
            self.returncode = 1 if gateway.spawn_failure else None

        def terminate(self):
            gateway.activity.append(('stop', self.profile))
            self.returncode = 0

        async def wait(self):
            return self.returncode

    async def spawn(*args, **kwargs):
        profile = args[args.index('--model') + 1]
        assert gateway.process is None or gateway.process.returncode is not None
        assert kwargs['cwd'] == tmp_path
        assert kwargs['env']['HF_HUB_OFFLINE'] == '1'
        gateway.activity.append(('start', profile))
        return Process(profile)

    async def handler(request):
        profile = gateway.current_model
        if request.url.path == '/health':
            return httpx.Response(200, json={'model_profile': profile, 'model_loaded': False, 'status': 'unloaded'})
        gateway.activity.append(('infer', profile))
        gateway.requests.append(request)
        if gateway.inference_handler:
            return await gateway.inference_handler(request)
        return httpx.Response(200, json={'model': {'profile': profile}})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(model_gateway.asyncio, 'create_subprocess_exec', spawn)
    monkeypatch.setattr(model_gateway.httpx, 'AsyncClient',
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs))
    return gateway


def post(client, model=None, guard=True, **overrides):
    fields = {'user_request': 'Where is the exit?', 'guard_enabled': str(guard).lower(), **overrides}
    if model is not None:
        fields['model_profile'] = model
    return client.post('/v1/analyze', data=fields, files={'image': ('scene.png', b'original image', 'image/png')})


def test_catalog_is_nvidia_only_and_reading_health_does_not_load_a_model(gateway):
    with TestClient(create_app(gateway)) as client:
        health = client.get('/health').json()
        assert health['default_model'] == DEFAULT_MODEL
        assert [model['id'] for model in health['models']] == [DEFAULT_MODEL, COSMOS]
        assert all(model['available'] for model in health['models'])
        assert health['model_loaded'] is False
        assert gateway.activity == []


def test_selection_reuses_one_worker_and_releases_it_before_switching(gateway):
    with TestClient(create_app(gateway)) as client:
        assert post(client).json()['model']['profile'] == DEFAULT_MODEL
        assert post(client, DEFAULT_MODEL, guard=False).json()['model']['profile'] == DEFAULT_MODEL
        assert post(client, COSMOS).json()['model']['profile'] == COSMOS
        assert gateway.activity == [('start', DEFAULT_MODEL), ('infer', DEFAULT_MODEL),
            ('infer', DEFAULT_MODEL), ('stop', DEFAULT_MODEL), ('start', COSMOS), ('infer', COSMOS)]
        assert b'original image' in gateway.requests[0].content
        assert b'Where is the exit?' in gateway.requests[0].content
        assert b'name="guard_enabled"\r\n\r\nfalse' in gateway.requests[1].content
    assert gateway.activity[-1] == ('stop', COSMOS)


@pytest.mark.parametrize('profile', ['qwen3vl-8b', '../bin/python', 'cosmos; shutdown'])
def test_unlisted_models_cannot_start_a_process(gateway, profile):
    with TestClient(create_app(gateway)) as client:
        assert post(client, profile).status_code == 422
        assert gateway.activity == []


def test_missing_environment_and_invalid_inputs_do_not_fall_back(gateway):
    gateway.profiles[COSMOS] = ModelProfile('Cosmos', 'nvidia/Cosmos', Path('/missing/python'))
    with TestClient(create_app(gateway)) as client:
        assert client.get('/health').json()['models'][1]['available'] is False
        assert post(client, COSMOS).status_code == 503
        assert post(client, user_request=' ').status_code == 422
        assert post(client, mode='unsupported').status_code == 422
        assert gateway.activity == []


def test_cancellation_keeps_the_gpu_locked_until_the_inference_finishes(gateway):
    async def check():
        started, release = asyncio.Event(), asyncio.Event()

        async def inference(request):
            started.set()
            await release.wait()
            gateway.activity.append(('finished', DEFAULT_MODEL))
            return httpx.Response(200, json={'model': {'profile': DEFAULT_MODEL}})

        gateway.inference_handler = inference
        active = asyncio.create_task(gateway.analyze(DEFAULT_MODEL, b'frame', 'image/png', {}))
        await started.wait()
        active.cancel()
        await asyncio.sleep(0)
        with pytest.raises(HTTPException) as busy:
            await gateway.analyze(COSMOS, b'frame', 'image/png', {})
        assert busy.value.status_code == 409
        assert ('stop', DEFAULT_MODEL) not in gateway.activity
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await active
        gateway.inference_handler = None
        await gateway.analyze(COSMOS, b'frame', 'image/png', {})
        assert gateway.activity.index(('finished', DEFAULT_MODEL)) < gateway.activity.index(('stop', DEFAULT_MODEL))
        await gateway.close()
    asyncio.run(check())


@pytest.mark.parametrize('failure', ['timeout', 'wrong-model', 'load-failure'])
def test_failed_inference_releases_its_worker_and_can_retry_without_substitution(gateway, failure):
    async def inference(request):
        if failure == 'timeout':
            raise httpx.ReadTimeout('still running')
        if failure == 'load-failure':
            return httpx.Response(503, json={'detail': 'CUDA_OOM'})
        return httpx.Response(200, json={'model': {'profile': COSMOS}})

    gateway.inference_handler = inference
    with TestClient(create_app(gateway)) as client:
        assert post(client).status_code == {'timeout': 504, 'wrong-model': 502, 'load-failure': 503}[failure]
        assert gateway.process is None
        assert gateway.activity[-1] == ('stop', DEFAULT_MODEL)
        gateway.inference_handler = None
        assert post(client, DEFAULT_MODEL).json()['model']['profile'] == DEFAULT_MODEL
        assert all(profile == DEFAULT_MODEL for _, profile in gateway.activity)


def test_worker_startup_failure_is_reported_and_releases_the_lock(gateway):
    gateway.spawn_failure = True
    with TestClient(create_app(gateway)) as client:
        assert post(client).status_code == 503
        assert gateway.process is None
        assert not gateway.lock.locked()
        gateway.spawn_failure = False
        assert post(client).status_code == 200
