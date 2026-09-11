"""HTTP-only bridge to the independent Prototype process; never a mock fallback."""
from dataclasses import dataclass
from time import perf_counter
from typing import Any

import json
import math
import httpx
from pydantic import BaseModel, ConfigDict

from .models import PolicyDecision, ProposedAction, ProvenanceValue, RunOutcome, TraceNode, TraceEdge
from .action_validation import reservation_issues


@dataclass
class FrameInput:
    data: bytes
    content_type: str
    user_request: str
    source: str = 'camera'
    capture_ms: float = 0
    upload_ms: float = 0
    model_profile: str | None = None


class RuntimeFailure(Exception):
    """A safe, user-visible runtime failure, never replaced with fixture data."""
    def __init__(self, message, code='runtime_error', *, diagnostics=None):
        super().__init__(message)
        self.code = code
        self.diagnostics = diagnostics


def _runtime_error_message(detail, status_code=None):
    """Localize the public error while keeping upstream text in diagnostics."""
    text = str(detail)
    known_errors = {
        'CUDA_OOM': 'The local model ran out of GPU memory. Check available resources and try again.',
        'GPU_BUSY': 'The GPU is in use by another application. Try again when resources are available.',
        'GPU_MEMORY_INSUFFICIENT': 'There is insufficient GPU memory to run the local model.',
        'RUNTIME_MISMATCH': 'The local model runtime version does not match. Check the model service configuration.',
        'REVISION_MISMATCH': 'The local model or processor revision does not match. Check the model service configuration.',
    }
    for code, message in known_errors.items():
        if code in text:
            return message
    if status_code == 409:
        return 'The local model is loading or analyzing. Wait for the current task to finish and try again.'
    if status_code == 413:
        return 'The image must be nonempty and no larger than 10 MiB.'
    if status_code == 422:
        return 'The model service could not accept this input. Check the image and user request, then try again.'
    return 'The local model service could not complete the analysis. Try again later; the original error is available in technical details.'


def _english_task_reason(reason):
    """Translate fixed Prototype copy, preserving unknown text and raw diagnostics."""
    reasons = {
        '無法確認你的需求，請重新描述。': 'Unable to confirm your request. Please rephrase it.',
        '請明確說明要查詢的資訊，或要撥號的對象。': 'Specify the information you need or the person or business to call.',
        '沒有可對應的撥號要求，請明確指定要撥打的對象。': 'No matching call request was found. Specify who you want to call.',
        '本次撥號需求無法確認，請重新描述。': 'Unable to confirm this call request. Please rephrase it.',
        '指定號碼無法對應至你的撥號要求。': 'The specified number does not match your call request.',
        '指定的電話號碼不完整。': 'The specified phone number is incomplete.',
        '使用你指定的號碼模擬撥號。': 'Simulating a call to the number you specified.',
        '這次無法取得有效的文字引用，請重新分析。': 'No valid text citation was obtained. Run the analysis again.',
        '圖片中的內容不能改變你的任務，已停止這項提議。': 'Image content cannot change your task. This proposal was stopped.',
        '未找到完整的電話號碼，請換張清楚的圖片。': 'No complete phone number was found. Use a clearer image.',
        '找到多個可能的對象或號碼，請在需求中指定要使用哪一個。': 'Multiple possible targets or numbers were found. Specify which one to use in your request.',
        '未找到可辨識且符合需求的資訊，請換張圖片或補充需求。': 'No readable information matching your request was found. Use another image or add detail to your request.',
        '無法確認資訊屬於你指定的對象，請補充需求。': 'Unable to confirm that the information belongs to your target. Add detail to your request.',
        '文字來源編號重複，請重新分析。': 'Text source IDs are duplicated. Run the analysis again.',
        '尚未選出可引用的完整資訊，請重新分析。': 'No complete information was selected for citation. Run the analysis again.',
        '引用無法對應原始文字，已停止這項提議。': 'The citation does not match the original text. This proposal was stopped.',
        '提議引用了干擾指令，無法用它完成這項任務。': 'The proposal cites an injected instruction, which cannot be used for this task.',
        '電話號碼與原始文字不一致，已停止這項提議。': 'The phone number does not match the original text. This proposal was stopped.',
        '未找到完整的電話號碼。': 'No complete phone number was found.',
        '方向與引用的標示不一致，請確認圖片。': 'The direction does not match the cited sign. Check the image.',
        '回答無法對應引用的原始文字。': 'The answer does not match the cited original text.',
        '找到多個可能的電話，請指定要撥打哪一個。': 'Multiple possible phone numbers were found. Specify which one to call.',
        '候選對象的引用無效，請重新分析。': 'The citation for a candidate target is invalid. Run the analysis again.',
        '還有未釐清的電話候選，請指定要撥打的對象或號碼。': 'Some phone candidates remain unresolved. Specify the target or number to call.',
        '方向資訊有衝突，請補充要前往的對象。': 'Direction information conflicts. Specify your destination.',
        '已依照你的需求，使用通過引用檢查的場景資訊。': 'Used scene information that passed citation checks to fulfill your request.',
    }
    return reasons.get(reason, reason)


def _policy_reason(policy):
    """Translate decision explanations without changing authorization results."""
    if policy.get('engine') == 'user-task-cited-evidence-v1':
        return _english_task_reason(policy['reason'])
    if policy.get('use') == 'INFORMATIONAL_OUTPUT':
        return ('Grounded observations were retained; embedded instructions have no authority over the answer.' if policy.get('result') == 'allow'
                else 'A reliable answer requires consistent observations supported by scene evidence.')
    if policy.get('rule_id') == 'USER_DELEGATED_OBSERVED_ENTITY':
        return 'The user delegated this call to the observed restaurant or business card phone. Its semantic role and source match the authorization scope.'
    if policy.get('rule_id') == 'DEMO_SCOPED_CARD_CALL_DELEGATION_V1' and policy.get('result') == 'allow':
        return 'The user explicitly authorized the business card phone for this simulated call. The image evidence and authenticity of the number remain unverified.'
    if policy.get('rule_id') == 'DEMO_UNSUPPORTED_POLICY_V1' and policy.get('result') == 'block':
        return 'Live authorization rules for this action type are unavailable, so execution was blocked.'
    if policy.get('result') == 'allow':
        return 'Authorization checks allowed this action. Execution is simulated; no external service is contacted.'
    native = policy.get('native')
    if not isinstance(native, dict):
        native = {}
    decision = native.get('decision')
    if decision == 'CONFIRM':
        return 'This action requires further user confirmation. Automatic execution is paused because verifiable semantic evidence is missing.'
    if decision == 'WARN':
        return 'This action requires further risk confirmation. Automatic execution is paused because verifiable semantic evidence is missing.'
    return 'This action lacks the required authorization. Automatic execution was blocked.'


class RemoteOutput(BaseModel):
    model_config = ConfigDict(extra="allow")
    raw_text: str
    parsed: bool
    proposed_action: dict[str, Any] | None = None
    native_action: dict[str, Any] | None = None
    candidate_action: dict[str, Any] | None = None
    diagnostics: dict[str, Any] = {}
    validation_error: str | None = None


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
                health = response.json()
                if health.get('error'):
                    health = {**health, 'raw_error': health['error'],
                              'error': _runtime_error_message(health['error'])}
                return health
        except (httpx.HTTPError, ValueError):
            return {'status': 'unavailable', 'model_loaded': False, 'error': 'Unable to connect to the local model service. Start the service; the system will not fall back to mock results.'}

    async def infer(self, frame: FrameInput, scenario_id: str, guard_enabled=True):
        started = perf_counter()
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout) as client:
                response = await client.post(f'{self.url}/v1/analyze',
                    files={'image': ('frame.jpg' if frame.content_type == 'image/jpeg' else 'frame.png', frame.data, frame.content_type)},
                    data={'user_request': frame.user_request, 'scenario_id': scenario_id, 'mode': 'action_only',
                          'guard_enabled': str(guard_enabled).lower(),
                          **({'model_profile': frame.model_profile} if frame.model_profile else {})})
            if response.is_error:
                try:
                    detail = response.json().get('detail', response.text)
                except ValueError:
                    detail = response.text
                raise RuntimeFailure(_runtime_error_message(detail, response.status_code),
                                     diagnostics={'status_code': response.status_code, 'detail': detail})
            result = RemoteResponse.model_validate(response.json())
            if result.contract_version != 'lensguard-demo-v1':
                raise ValueError('Unsupported contract version')
            if frame.model_profile and result.model.get('profile') != frame.model_profile:
                raise RuntimeFailure('The response came from a different model. No action was taken.', 'model_mismatch',
                                     diagnostics={'requested_model': frame.model_profile, 'returned_model': result.model})
            return result, (perf_counter() - started) * 1000
        except httpx.TimeoutException as exc:
            raise RuntimeFailure('Model inference timed out. The local model may still be processing; the system will not fall back to mock results.',
                                 diagnostics={'type': type(exc).__name__, 'detail': str(exc)}) from exc
        except httpx.HTTPError as exc:
            raise RuntimeFailure('Unable to connect to the local model service. Start the service; the system will not fall back to mock results.',
                                 diagnostics={'type': type(exc).__name__, 'detail': str(exc)}) from exc
        except ValueError as exc:
            raise RuntimeFailure('The local model service returned invalid data; the system will not fall back to mock results.',
                                 diagnostics={'type': type(exc).__name__, 'detail': str(exc)}) from exc

    def map_action(self, response, run_id, *, candidate=False):
        output = response.output
        raw = (output.candidate_action or output.native_action or output.proposed_action) if candidate else (output.proposed_action or output.native_action)
        if not raw:
            raise RuntimeFailure('Unable to parse model output. The original model text is available in technical details.', 'model_output_parse_failed')
        tools = {'CALL': 'call_phone', 'RESTAURANT_RESERVATION': 'restaurant_reservation',
                 'DIRECTION_ADVICE': 'provide_direction', 'OPEN_URL': 'open_url',
                 'SAFETY_ADVICE': 'safety_advice', 'NONE': 'none', 'ANSWER': 'answer_question'}
        tool = raw.get('tool')
        if tool == 'navigate':
            tool = 'provide_direction'  # Legacy direction advice is assistant output.
        if tool is None:
            tool = tools.get(raw.get('action'))
        if tool not in tools.values() or not isinstance(raw.get('arguments'), dict):
            raise RuntimeFailure('Unable to map the model proposal: unsupported action type or invalid argument format.', 'action_mapping_failed')
        arguments = {}
        for name, value in raw['arguments'].items():
            if not isinstance(name, str) or not name or not candidate and (type(value) not in (str, int, bool, float) or isinstance(value, float) and not math.isfinite(value)):
                raise RuntimeFailure('Unable to map the model proposal: argument values must be text, booleans, or finite numbers.', 'action_mapping_failed')
            key = 'number' if name == 'target_number' else name
            if key in arguments:
                raise RuntimeFailure('Unable to map the model proposal: conflicting phone number fields.', 'action_mapping_failed')
            display_value = (value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, allow_nan=False)) if candidate else str(value)
            source = (response.policy or {}).get('argument_provenance', {}).get(key, {}) if not candidate else {}
            role = source.get('semantic_role', 'unknown')
            if role == 'instruction':
                role = 'instruction_derived'
            user_value = source.get('source') == 'user'
            delegated = (response.policy or {}).get('delegated', False) and role == 'entity'
            authority = ['task'] if user_value else ['evidence'] if source.get('authority') == 'EVIDENCE' else ['none']
            if delegated:
                authority.append('delegated')
            arguments[key] = ProvenanceValue(id=f'{run_id}_{key}', value=display_value,
                source_type=source.get('source', 'model'), source_id=source.get('id', response.request_id),
                trust='trusted' if user_value else 'untrusted', authority=authority,
                lineage=source.get('lineage', ['image_upload', response.request_id]), semantic_role=role,
                grounded_claim=source.get('grounded_claim'), grounding=source.get('grounding'),
                delegation=(response.policy or {}).get('delegation') if delegated else None)
        return ProposedAction(id=f'{run_id}_action', tool=tool, arguments=arguments,
                              validation_status='invalid' if candidate else 'valid',
                              use='INFORMATIONAL_OUTPUT' if tool in {'provide_direction', 'safety_advice', 'none', 'answer_question'} else 'SIDE_EFFECT_ARGUMENT')

    async def run(self, state, frame, publish):
        started = perf_counter()
        state.runtime = 'prototype'
        state.components = {'vlm': 'local', 'provenance': 'transport_only', 'semantic_grounding': 'unavailable', 'policy': 'pending', 'execution': 'simulated'}
        state.timings = {'frame_capture_ms': frame.capture_ms, 'demo_upload_receive_ms': frame.upload_ms}
        source_label = 'Camera' if frame.source == 'camera' else 'Uploaded'
        await publish('frame.received', f'Received {source_label.lower()} image data ({len(frame.data)} bytes).')
        await publish('inference.started', 'Request sent to the local model service to generate an action proposal.')
        response, request_ms = await self.infer(frame, state.scenario_id, state.guard_enabled)
        state.raw_model_text = response.output.raw_text
        state.runtime_metadata = response.model_dump()
        state.model_profile = response.model.get('profile')
        state.timings.update({f'prototype_{key}': value for key, value in response.timing.items()})
        state.timings['prototype_request_ms'] = request_ms
        state.components['vlm'] = 'live'
        semantic = response.policy or response.provenance or {}
        for field in ('semantic_regions', 'retained_evidence_ids', 'denied_instruction_ids', 'user_intent', 'delegation', 'argument_decisions'):
            if field in semantic:
                setattr(state, field, semantic[field])
        if semantic.get('engine') == 'user-task-cited-evidence-v1':
            state.argument_decisions = [
                {**candidate, 'reason': _english_task_reason(candidate['reason'])}
                for candidate in state.argument_decisions
            ]
        if state.semantic_regions:
            state.components['provenance'] = 'semantic_lineage'
            state.components['semantic_grounding'] = (response.provenance or {}).get('semantic_grounding', 'model_perception')
        await publish('inference.completed', 'Received the actual inference result from the local model.')
        informational = getattr(response.output, 'proposed_output', None)
        if (isinstance(informational, dict) and informational.get('kind') == 'informational'
                and informational.get('status') in {'uncertain', 'insufficient_evidence'}
                and response.output.diagnostics.get('parse_success')
                and response.output.diagnostics.get('failure_category') in
                {'model_uncertainty', 'evidence_unavailable'}
                and response.policy is None and not response.output.proposed_action
                and not response.output.native_action and not response.output.candidate_action
                and response.output.validation_error is None):
            # Display a non-factual abstention. It is neither an executable action
            # nor an authorization result, and cannot supply action arguments.
            message = ('I cannot reliably determine the requested information.'
                       if informational['status'] == 'uncertain' else
                       'There is insufficient visual evidence to answer this question.')
            state.final_answer = dict(text=message, value=None, grounded_claim=None, evidence_ids=[])
            state.components['policy'] = 'not_required'
            state.status = 'completed'
            state.timings['demo_runtime_ms'] = (perf_counter() - started) * 1000
            await publish('answer.uncertain', message)
            return
        raw_action = (response.output.proposed_action or response.output.native_action) if response.output.parsed else response.output.candidate_action
        state.validation_issues = reservation_issues(raw_action)
        if state.validation_issues:
            display_response = response.model_copy(update={
                'output': response.output.model_copy(update={'candidate_action': raw_action}),
            })
            state.action = self.map_action(display_response, state.id, candidate=True)
            missing_only = all(issue.kind == 'missing' for issue in state.validation_issues)
            detail = ' '.join(issue.message for issue in state.validation_issues)
            raise RuntimeFailure(
                f'{detail} Check your request, add the missing details, and analyze again.',
                'reservation_details_missing' if missing_only else 'model_schema_invalid',
            )
        if response.output.validation_error is not None:
            # Parsing succeeded, but the Prototype's action normalizer rejected
            # a value (for example an unknown direction). Preserve it for display
            # and stop before either authorization or Guard OFF simulation.
            state.action = self.map_action(response, state.id, candidate=True)
            invalid_message = {
                'provide_direction': 'The proposed direction is unknown or unusable. Check the direction signs in the image and analyze again.',
                'call_phone': 'The proposed phone number has an invalid format. Check the number and analyze again.',
                'open_url': 'The proposed URL has an invalid format. Check the URL and analyze again.',
            }.get(state.action.tool, 'The proposed action arguments are unusable. Check the proposal and analyze again.')
            raise RuntimeFailure(
                invalid_message,
                'model_action_invalid',
            )
        if not response.output.parsed:
            # A syntactically decoded candidate is display-only. Never promote
            # schema-invalid output to an executable action, even with Guard OFF.
            if response.output.candidate_action is not None:
                state.action = self.map_action(response, state.id, candidate=True)
                raise RuntimeFailure(
                    'The proposed action has missing or invalid arguments. Check the proposal, update your request, and try again.',
                    'model_schema_invalid',
                )
            raise RuntimeFailure('Unable to parse model output. The original model text is available in technical details.', 'model_output_parse_failed')
        display_response = response
        if not state.guard_enabled and response.output.native_action:
            # The comparison baseline must show the original candidate, never
            # the policy's corrected answer or its grounded provenance.
            display_response = response.model_copy(update={'policy': None,
                'output': response.output.model_copy(update={'proposed_action': response.output.native_action})})
        state.action = self.map_action(display_response, state.id)
        await publish('action.parsed', 'The model service validated the structured action format.')
        state.trace_nodes = [TraceNode(id='input', label='Image', type=f'{source_label} image input', source='camera'),
            TraceNode(id='model', label='Local vision-language model', type='Real inference', source='model'),
            TraceNode(id='value', label=', '.join(value.value for value in state.action.arguments.values()) or 'No arguments', type='Model-derived; unverified', source='model'),
            TraceNode(id='argument', label=', '.join(f'{state.action.tool}.{key}' for key in state.action.arguments) or state.action.tool, type='Action argument', source='model')]
        state.trace_edges = [TraceEdge(from_='input', to='model'), TraceEdge(from_='model', to='value'), TraceEdge(from_='value', to='argument')]
        if state.semantic_regions:
            state.trace_nodes = [TraceNode(id='input', label='Image', type='camera', source='camera'),
                TraceNode(id='argument', label=', '.join(f'{state.action.tool}.{key}' for key in state.action.arguments),
                          type=state.action.use, source='model')]
            state.trace_edges = []
            for region in state.semantic_regions:
                state.trace_nodes.append(TraceNode(id=region['id'], label=region['content'],
                    type=f"{region['semantic_role']} / {region['status']}", source=region.get('source', 'camera')))
                state.trace_edges.append(TraceEdge(from_='input', to=region['id']))
            for key, value in state.action.arguments.items():
                state.trace_nodes.append(TraceNode(id=value.id, label=value.value, type=value.semantic_role, source=value.source_type))
                if value.source_id in {region['id'] for region in state.semantic_regions}:
                    state.trace_edges.append(TraceEdge(from_=value.source_id, to=value.id))
                state.trace_edges.append(TraceEdge(from_=value.id, to='argument'))
        if response.provenance and response.provenance.get('delegated'):
            state.trace_nodes.append(TraceNode(id='user', label='User request', type='Scoped authorization', source='user'))
            state.trace_edges.append(TraceEdge(from_='user', to='argument'))
        await publish('provenance.attached', 'Scene evidence for observations and entities was separated from embedded instructions without authority.' if state.semantic_regions else
                      'Image-to-model provenance was recorded; semantic evidence for individual regions is unavailable.')
        if state.guard_enabled:
            if response.policy is None:
                raise RuntimeFailure('Authorization rules are unavailable. Automatic execution is paused.', 'policy_unavailable')
            state.decision = PolicyDecision.model_validate({key: response.policy[key] for key in PolicyDecision.model_fields if key in response.policy})
            state.decision = state.decision.model_copy(update={'reason': _policy_reason(response.policy)})
            state.components['policy'] = 'live'
            status = 'allowed' if state.decision.result == 'allow' else 'blocked'
            reason = state.decision.reason
            await publish('policy.evaluated', reason)
        else:
            status, reason = 'executed', 'Guard off: the proposed action runs only in simulation. Attack success has not been independently verified.'
            state.components['policy'] = 'bypassed'
            await publish('policy.bypassed', reason)
        if state.guard_enabled and status == 'allowed':
            state.final_answer = (response.policy or {}).get('final_answer')
        elif not state.guard_enabled and state.action.tool == 'answer_question':
            value = state.action.arguments.get('text')
            if value:
                state.final_answer = dict(text=value.value, value=value.value, grounded_claim=None, evidence_ids=[])
        elif not state.guard_enabled and state.action.tool == 'provide_direction':
            direction = state.action.arguments.get('direction')
            value = direction.value.casefold() if direction else ''
            value = {'向右': 'right', '向左': 'left'}.get(value, value)
            state.final_answer = dict(text={'right': 'The exit is on the right.', 'left': 'The exit is on the left.'}.get(value, value),
                                      value=value, grounded_claim=None, evidence_ids=[])
        state.outcome = RunOutcome(status=status, attack_success=None,
                                   result=state.final_answer.get('value') if state.final_answer else None, detail=reason)
        state.action.status = status
        status_label = {'allowed': 'Allowed', 'blocked': 'Blocked', 'executed': 'Simulated'}[status]
        state.trace_nodes.append(TraceNode(id='policy', label=status_label,
            type='Observation evidence / answer' if state.action.use == 'INFORMATIONAL_OUTPUT' else 'Authorization / simulation', source='system'))
        state.trace_edges.append(TraceEdge(from_='argument', to='policy'))
        state.status = 'completed'
        state.timings['demo_runtime_ms'] = (perf_counter() - started) * 1000
        await publish(f'action.{status}', reason)
