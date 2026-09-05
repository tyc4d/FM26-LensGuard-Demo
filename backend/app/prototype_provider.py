"""HTTP-only bridge to the independent Prototype process; never a mock fallback."""
from dataclasses import dataclass
from time import perf_counter
from typing import Any

import json
import math
import httpx
from pydantic import BaseModel, ConfigDict

from .models import PolicyDecision, ProposedAction, ProvenanceValue, RunOutcome, TraceNode, TraceEdge


@dataclass
class FrameInput:
    data: bytes
    content_type: str
    user_request: str
    source: str = 'camera'
    capture_ms: float = 0
    upload_ms: float = 0


class RuntimeFailure(Exception):
    """A safe, user-visible runtime failure, never replaced with fixture data."""
    def __init__(self, message, code='runtime_error'):
        super().__init__(message)
        self.code = code


class RemoteOutput(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_text: str
    parsed: bool
    proposed_action: dict[str, Any] | None = None
    native_action: dict[str, Any] | None = None
    candidate_action: dict[str, Any] | None = None
    diagnostics: dict[str, Any] = {}


class RemoteResponse(BaseModel):
    model_config = ConfigDict(extra='allow')
    contract_version: str
    request_id: str
    model: dict[str, Any]
    output: RemoteOutput
    provenance: dict[str, Any] | None
    policy: dict[str, Any] | None
    timing: dict[str, float]


class PrototypeRuntimeProvider:
    def __init__(self, url: str, timeout: float = 180, transport=None):
        self.url = url.rstrip('/')
        self.timeout = timeout
        self.transport = transport

    async def health(self):
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=3) as client:
                response = await client.get(f'{self.url}/health')
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError):
            return {'status': 'unavailable', 'model_loaded': False, 'error': 'Prototype service unavailable. Start the local runtime; mock fallback is disabled.'}

    async def infer(self, frame: FrameInput, scenario_id: str):
        started = perf_counter()
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout) as client:
                response = await client.post(f'{self.url}/v1/analyze',
                    files={'image': ('frame.jpg' if frame.content_type == 'image/jpeg' else 'frame.png', frame.data, frame.content_type)},
                    data={'user_request': frame.user_request, 'scenario_id': scenario_id, 'mode': 'action_only'})
            if response.is_error:
                try:
                    detail = response.json().get('detail', 'Prototype rejected the request.')
                except ValueError:
                    detail = 'Prototype rejected the request.'
                raise RuntimeFailure(f'Prototype runtime ({response.status_code}): {detail}')
            result = RemoteResponse.model_validate(response.json())
            if result.contract_version != 'lensguard-demo-v1':
                raise ValueError('Unsupported contract version')
            return result, (perf_counter() - started) * 1000
        except httpx.TimeoutException as exc:
            raise RuntimeFailure('Inference timeout. The Prototype may still be processing; no mock fallback was used.') from exc
        except httpx.HTTPError as exc:
            raise RuntimeFailure('Prototype service unavailable. Start the local runtime; no mock fallback was used.') from exc
        except ValueError as exc:
            raise RuntimeFailure('Prototype returned an invalid API contract; no mock fallback was used.') from exc

    def map_action(self, response, run_id, *, candidate=False):
        output = response.output
        raw = output.candidate_action if candidate else (output.proposed_action or output.native_action)
        if not raw:
            raise RuntimeFailure('Model output could not be parsed. Raw model text is available in technical details.', 'model_output_parse_failed')
        tools = {'CALL': 'call_phone', 'RESTAURANT_RESERVATION': 'restaurant_reservation',
                 'DIRECTION_ADVICE': 'navigate', 'OPEN_URL': 'open_url',
                 'SAFETY_ADVICE': 'safety_advice', 'NONE': 'none'}
        tool = raw.get('tool')
        if tool is None:
            tool = tools.get(raw.get('action'))
        if tool not in tools.values() or not isinstance(raw.get('arguments'), dict):
            raise RuntimeFailure('Prototype action mapping failed: unsupported action or invalid arguments.', 'action_mapping_failed')
        arguments = {}
        for name, value in raw['arguments'].items():
            if not isinstance(name, str) or not name or not candidate and (type(value) not in (str, int, bool, float) or isinstance(value, float) and not math.isfinite(value)):
                raise RuntimeFailure('Prototype action mapping failed: argument values must be finite scalars.', 'action_mapping_failed')
            key = 'number' if name == 'target_number' else name
            if key in arguments:
                raise RuntimeFailure('Prototype action mapping failed: conflicting number aliases.', 'action_mapping_failed')
            display_value = (value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, allow_nan=False)) if candidate else str(value)
            arguments[key] = ProvenanceValue(id=f'{run_id}_{key}', value=display_value, source_type='model',
                source_id=response.request_id, trust='untrusted', authority=['none'], lineage=['image_upload', response.request_id])
        return ProposedAction(id=f'{run_id}_action', tool=tool, arguments=arguments,
                              validation_status='invalid' if candidate else 'valid')

    async def run(self, state, frame, publish):
        started = perf_counter()
        state.runtime = 'prototype'
        state.components = {'vlm': 'local', 'provenance': 'transport_only', 'semantic_grounding': 'unavailable', 'policy': 'pending', 'execution': 'simulated'}
        state.timings = {'frame_capture_ms': frame.capture_ms, 'demo_upload_receive_ms': frame.upload_ms}
        await publish('frame.received', f'One {frame.source} image received ({len(frame.data)} bytes).')
        await publish('inference.started', 'Request sent to local Prototype runtime; action-only inference.')
        response, request_ms = await self.infer(frame, state.scenario_id)
        state.raw_model_text = response.output.raw_text
        state.runtime_metadata = response.model_dump()
        state.timings.update({f'prototype_{key}': value for key, value in response.timing.items()})
        state.timings['prototype_request_ms'] = request_ms
        state.components['vlm'] = 'live'
        await publish('inference.completed', 'Real local model response received.')
        if not response.output.parsed:
            # A syntactically decoded candidate is display-only. Never promote
            # schema-invalid output to an executable action, even with Guard OFF.
            if response.output.candidate_action is not None:
                state.action = self.map_action(response, state.id, candidate=True)
                detail = response.output.diagnostics.get('error_message') or 'Required action arguments are missing or invalid.'
                raise RuntimeFailure(f'Model inference completed, but action schema validation failed: {detail}', 'model_schema_invalid')
            raise RuntimeFailure('Model output could not be parsed. Raw model text is available in technical details.', 'model_output_parse_failed')
        state.action = self.map_action(response, state.id)
        await publish('action.parsed', 'Structured action validated by Prototype parser.')
        state.trace_nodes = [TraceNode(id='input', label='IMAGE', type=f'{frame.source} input', source='camera'),
            TraceNode(id='model', label='LOCAL VLM', type='real inference', source='model'),
            TraceNode(id='value', label=', '.join(value.value for value in state.action.arguments.values()) or 'No arguments', type='model-derived; unverified', source='model'),
            TraceNode(id='argument', label=', '.join(f'{state.action.tool}.{key}' for key in state.action.arguments) or state.action.tool, type='action argument', source='model')]
        state.trace_edges = [TraceEdge(from_='input', to='model'), TraceEdge(from_='model', to='value'), TraceEdge(from_='value', to='argument')]
        if response.provenance and response.provenance.get('delegated'):
            state.trace_nodes.append(TraceNode(id='user', label='USER REQUEST', type='scoped delegation', source='user'))
            state.trace_edges.append(TraceEdge(from_='user', to='argument'))
        await publish('provenance.attached', 'Input-to-model transport lineage recorded. Semantic region grounding is unavailable.')
        if state.guard_enabled:
            if response.policy is None:
                raise RuntimeFailure('Policy unavailable. Automatic execution was withheld.')
            state.decision = PolicyDecision.model_validate({key: response.policy[key] for key in PolicyDecision.model_fields})
            state.components['policy'] = 'live'
            status = 'allowed' if state.decision.result == 'allow' else 'blocked'
            reason = state.decision.reason
            await publish('policy.evaluated', reason)
        else:
            status, reason = 'executed', 'Guard OFF: proposed action executed in simulation only. Attack success is not independently verified.'
            state.components['policy'] = 'bypassed'
            await publish('policy.bypassed', reason)
        state.outcome = RunOutcome(status=status, attack_success=None, result=None, detail=reason)
        state.action.status = status
        state.trace_nodes.append(TraceNode(id='policy', label=status.upper(), type='authorization / simulation', source='system'))
        state.trace_edges.append(TraceEdge(from_='argument', to='policy'))
        state.status = 'completed'
        state.timings['demo_runtime_ms'] = (perf_counter() - started) * 1000
        await publish(f'action.{status}', reason)
