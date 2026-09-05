import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.prototype_provider import PrototypeRuntimeProvider


def remote(parsed=True, allow=False, policy=True):
    return {'contract_version': 'lensguard-demo-v1', 'request_id': 'real_1', 'model': {'profile': 'gemma3-4b'},
        'output': {'raw_text': 'real raw output', 'parsed': parsed, 'proposed_action': {'tool': 'call_phone', 'arguments': {'number': '0988-111-222'}} if parsed else None},
        'provenance': {'kind': 'transport_only', 'delegated': allow},
        'policy': {'result': 'allow' if allow else 'block', 'rule_id': 'test-real-policy', 'affected_argument': 'call_phone.number', 'reason': 'A deterministic decision.', 'source_authority': 'DELEGATED' if allow else 'OBSERVATION_ONLY', 'required_authority': 'EXTERNAL_ACTION_TARGET'} if policy else None,
        'timing': {'inference_ms': 12.3, 'policy_ms': 0.2}}


def run(payload=None, guard=True, failure=None):
    requests = []
    def handler(request):
        requests.append(request)
        if failure: raise failure
        return httpx.Response(200, json=payload)
    provider = PrototypeRuntimeProvider('http://prototype.test', transport=httpx.MockTransport(handler))
    with TestClient(create_app(Settings(runtime='prototype'), provider)) as client:
        response = client.post('/api/run', files={'image': ('scene.jpg', b'real frame bytes', 'image/jpeg')},
            data={'scenario_id': 'reservation-injection', 'guard_enabled': str(guard).lower(), 'user_request': 'trusted task', 'source': 'camera', 'capture_ms': '3.2'})
        assert response.status_code == 202
        stream = client.get(f"/api/run/{response.json()['id']}/events").text
        snapshots = [json.loads(line[6:]) for line in stream.splitlines() if line.startswith('data: ')]
        return snapshots, requests


@pytest.mark.parametrize('allow,guard,expected', [(False, True, 'blocked'), (True, True, 'allowed'), (False, False, 'executed')])
def test_real_mapping_and_multipart(allow, guard, expected):
    snapshots, requests = run(remote(allow=allow), guard)
    final = snapshots[-1]
    assert final['outcome']['status'] == expected
    assert final['outcome']['attack_success'] is None
    assert final['action']['arguments']['number']['value'] == '0988-111-222'
    assert final['raw_model_text'] == 'real raw output'
    assert final['regions'] == []
    assert final['timings']['prototype_inference_ms'] == 12.3
    assert [s['events'][-1]['type'] for s in snapshots] == ['frame.received', 'inference.started', 'inference.completed', 'action.parsed', 'provenance.attached', 'policy.evaluated' if guard else 'policy.bypassed', f'action.{expected}']
    body = requests[0].content
    assert b'real frame bytes' in body and b'trusted task' in body and b'action_only' in body
    assert b'0912-345-678' not in body
    assert requests[0].url.path == '/v1/analyze'


def test_parse_failure_preserves_raw():
    snapshots, _ = run(remote(parsed=False))
    assert snapshots[-1]['status'] == 'failed'
    assert snapshots[-1]['action'] is None
    assert snapshots[-1]['raw_model_text'] == 'real raw output'
    assert 'could not be parsed' in snapshots[-1]['error']


@pytest.mark.parametrize('error', [httpx.ConnectError('offline'), httpx.ReadTimeout('slow')])
def test_no_mock_fallback(error):
    snapshots, _ = run(failure=error)
    assert snapshots[-1]['status'] == 'failed'
    assert snapshots[-1]['action'] is None
    assert 'no mock fallback' in snapshots[-1]['error']


def test_missing_policy_blocks_execution():
    snapshots, _ = run(remote(policy=False))
    assert snapshots[-1]['status'] == 'failed'
    assert snapshots[-1]['outcome'] is None
    assert snapshots[-1]['error_code'] == 'policy_unavailable'
    assert snapshots[-1]['action'] is not None
    assert snapshots[-1]['components']['policy'] == 'not_evaluated'


@pytest.mark.parametrize('guard', [True, False])
@pytest.mark.parametrize('candidate_present', [True, False])
def test_unusable_direction_preserves_parser_result_but_never_executes(guard, candidate_present):
    payload = remote()
    native = {'action': 'DIRECTION_ADVICE', 'arguments': {'destination': '出口', 'direction': '未知'}}
    raw = json.dumps(native, ensure_ascii=False)
    payload['output'] = {
        'parsed': True, 'raw_text': raw, 'proposed_action': None, 'native_action': native,
        'candidate_action': native if candidate_present else None,
        'diagnostics': {'parse_success': True, 'schema_valid': True},
        'validation_error': "unsupported direction: '未知'",
    }
    # Even a stale policy in the response cannot override action validation.
    snapshots, _ = run(payload, guard)
    final = snapshots[-1]
    assert final['status'] == 'failed' and final['stage'] == 'runtime.failed'
    assert final['error_code'] == 'model_action_invalid'
    assert final['action']['tool'] == 'navigate'
    assert final['action']['arguments']['direction']['value'] == '未知'
    assert final['action']['arguments']['destination']['value'] == '出口'
    assert final['action']['validation_status'] == 'invalid'
    assert final['raw_model_text'] == raw
    assert final['runtime_metadata']['output']['parsed'] is True
    assert final['runtime_metadata']['output']['diagnostics']['schema_valid'] is True
    assert final['outcome'] is None and final['decision'] is None
    assert final['components']['policy'] == 'not_evaluated'
    assert [event['type'] for event in final['events']] == [
        'frame.received', 'inference.started', 'inference.completed', 'runtime.failed',
    ]


def test_image_required_and_unavailable_health():
    def offline(request): raise httpx.ConnectError('offline')
    provider = PrototypeRuntimeProvider('http://prototype.test', transport=httpx.MockTransport(offline))
    with TestClient(create_app(Settings(runtime='prototype'), provider)) as client:
        health = client.get('/api/health').json()
        assert health['runtime'] == 'prototype' and health['prototype']['status'] == 'unavailable'
        response = client.post('/api/run', json={'scenario_id': 'reservation-injection', 'guard_enabled': True})
        assert response.status_code == 422 and 'Image missing' in response.json()['detail']


@pytest.mark.parametrize('native', [False, True])
def test_complete_reservation_mapping(native):
    payload = remote()
    args = {'restaurant': 'Example Bistro', 'target_number': '02-2345-6661', 'time': '19:00', 'party_size': 2}
    action = {'action': 'RESTAURANT_RESERVATION', 'arguments': args} if native else {'tool':'restaurant_reservation', 'arguments': {('number' if k == 'target_number' else k): v for k,v in args.items()}}
    payload['output'] = {'parsed':True,'raw_text':json.dumps({'action':'RESTAURANT_RESERVATION','arguments':args}), ('native_action' if native else 'proposed_action'):action}
    payload['policy']['affected_argument'] = 'restaurant_reservation.number'
    snapshots, _ = run(payload)
    final = snapshots[-1]
    assert final['status'] == 'completed'
    assert final['action']['tool'] == 'restaurant_reservation'
    assert final['action']['arguments']['number']['value'] == '02-2345-6661'
    assert final['action']['arguments']['party_size']['value'] == '2'
    assert final['action']['validation_status'] == 'valid'


@pytest.mark.parametrize('guard', [True, False])
@pytest.mark.parametrize('missing', ['N/A', None])
def test_invalid_reservation_candidate_is_visible_but_never_executed(guard, missing):
    payload = remote(parsed=False, policy=False)
    payload['output']['candidate_action'] = {'action':'RESTAURANT_RESERVATION','arguments':{'restaurant':'Example Bistro','target_number':'02-2345-6661','time':missing,'party_size':missing}}
    payload['output']['diagnostics'] = {'parse_success':True,'schema_valid':False,'error_message':'party_size must be a positive integer'}
    snapshots, _ = run(payload, guard)
    final = snapshots[-1]
    assert final['action']['arguments']['party_size']['value'] == ('N/A' if missing else 'null')
    assert final['action']['arguments']['number']['value'] == '02-2345-6661'
    assert final['action']['validation_status'] == 'invalid'
    assert final['error_code'] == 'model_schema_invalid'
    assert final['status'] == 'failed' and final['stage'] == 'runtime.failed'
    assert final['outcome'] is None and final['decision'] is None
    assert final['runtime_metadata']['output']['diagnostics']['schema_valid'] is False
    assert sum(e['type'] == 'runtime.failed' for e in final['events']) == 1


@pytest.mark.parametrize('action', [
    {'action':'UNKNOWN','arguments':{}},
    {'tool':'call_phone','arguments':{'number':{}}},
    {'tool':'call_phone','arguments':{'number':'123','target_number':'456'}},
])
def test_mapping_failure_sends_terminal_sse(action):
    payload = remote()
    payload['output']['proposed_action'] = action
    snapshots, _ = run(payload)
    final = snapshots[-1]
    assert final['status'] == 'failed' and final['stage'] == 'runtime.failed'
    assert final['error_code'] == 'action_mapping_failed'
    assert final['outcome'] is None
    assert final['raw_model_text'] == 'real raw output'
