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
        'CUDA_OOM': '本機模型的顯示記憶體不足，請確認資源可用後再試。',
        'GPU_BUSY': '顯示卡正由其他程式使用，請待資源空閒後再試。',
        'GPU_MEMORY_INSUFFICIENT': '可用的顯示記憶體不足，暫時無法執行本機模型。',
        'RUNTIME_MISMATCH': '本機模型的執行環境版本不符，請檢查模型服務設定。',
        'REVISION_MISMATCH': '本機模型或處理器的版本不符，請檢查模型服務設定。',
    }
    for code, message in known_errors.items():
        if code in text:
            return message
    if status_code == 409:
        return '本機模型正在載入或分析中，請待目前的工作完成後再試。'
    if status_code == 413:
        return '圖片不得為空，且大小不得超過 10 MiB。'
    if status_code == 422:
        return '模型服務無法接受本次輸入，請檢查影像與使用者需求後重試。'
    return '本機模型服務目前無法完成分析，請稍後重試；原始錯誤可在技術詳細資訊中查看。'


def _policy_reason(policy):
    """Translate decision explanations without changing authorization results."""
    if policy.get('engine') == 'user-task-cited-evidence-v1':
        return policy['reason']
    if policy.get('use') == 'INFORMATIONAL_OUTPUT':
        return ('已保留有場景依據的觀察；嵌入指令不具回答權限。' if policy.get('result') == 'allow'
                else '缺少一致且有場景依據的觀察，無法形成可靠答案。')
    if policy.get('rule_id') == 'USER_DELEGATED_OBSERVED_ENTITY':
        return '使用者已委派本次撥號使用觀察到的餐廳／名片電話；號碼的語意角色與來源符合授權範圍。'
    if policy.get('rule_id') == 'DEMO_SCOPED_CARD_CALL_DELEGATION_V1' and policy.get('result') == 'allow':
        return '使用者已明確授權本次模擬撥號使用名片上的電話；號碼的影像依據與真實性仍未經驗證。'
    if policy.get('rule_id') == 'DEMO_UNSUPPORTED_POLICY_V1' and policy.get('result') == 'block':
        return '目前尚未提供此類行動的即時授權規則，因此已阻擋執行。'
    if policy.get('result') == 'allow':
        return '授權檢查已允許此行動。目前僅執行模擬，不會聯絡外部服務。'
    native = policy.get('native')
    if not isinstance(native, dict):
        native = {}
    decision = native.get('decision')
    if decision == 'CONFIRM':
        return '此行動需要使用者進一步確認；目前缺少可驗證的語意依據，已暫停自動執行。'
    if decision == 'WARN':
        return '此行動需要進一步確認風險；目前缺少可驗證的語意依據，已暫停自動執行。'
    return '此行動未取得所需授權，已阻擋自動執行。'


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
            return {'status': 'unavailable', 'model_loaded': False, 'error': '無法連線至本機模型服務，請啟動模型服務；系統不會改用模擬結果。'}

    async def infer(self, frame: FrameInput, scenario_id: str, guard_enabled=True):
        started = perf_counter()
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=self.timeout) as client:
                response = await client.post(f'{self.url}/v1/analyze',
                    files={'image': ('frame.jpg' if frame.content_type == 'image/jpeg' else 'frame.png', frame.data, frame.content_type)},
                    data={'user_request': frame.user_request, 'scenario_id': scenario_id, 'mode': 'action_only',
                          'guard_enabled': str(guard_enabled).lower()})
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
            return result, (perf_counter() - started) * 1000
        except httpx.TimeoutException as exc:
            raise RuntimeFailure('模型推論逾時。本機模型可能仍在處理中；系統不會改用模擬結果。',
                                 diagnostics={'type': type(exc).__name__, 'detail': str(exc)}) from exc
        except httpx.HTTPError as exc:
            raise RuntimeFailure('無法連線至本機模型服務，請啟動模型服務；系統不會改用模擬結果。',
                                 diagnostics={'type': type(exc).__name__, 'detail': str(exc)}) from exc
        except ValueError as exc:
            raise RuntimeFailure('本機模型服務回傳的資料格式無效；系統不會改用模擬結果。',
                                 diagnostics={'type': type(exc).__name__, 'detail': str(exc)}) from exc

    def map_action(self, response, run_id, *, candidate=False):
        output = response.output
        raw = (output.candidate_action or output.native_action or output.proposed_action) if candidate else (output.proposed_action or output.native_action)
        if not raw:
            raise RuntimeFailure('無法解析模型輸出。原始模型文字可在技術詳細資訊中查看。', 'model_output_parse_failed')
        tools = {'CALL': 'call_phone', 'RESTAURANT_RESERVATION': 'restaurant_reservation',
                 'DIRECTION_ADVICE': 'provide_direction', 'OPEN_URL': 'open_url',
                 'SAFETY_ADVICE': 'safety_advice', 'NONE': 'none', 'ANSWER': 'answer_question'}
        tool = raw.get('tool')
        if tool == 'navigate':
            tool = 'provide_direction'  # Legacy direction advice is assistant output.
        if tool is None:
            tool = tools.get(raw.get('action'))
        if tool not in tools.values() or not isinstance(raw.get('arguments'), dict):
            raise RuntimeFailure('無法轉換模型提議：行動類型不受支援，或參數格式無效。', 'action_mapping_failed')
        arguments = {}
        for name, value in raw['arguments'].items():
            if not isinstance(name, str) or not name or not candidate and (type(value) not in (str, int, bool, float) or isinstance(value, float) and not math.isfinite(value)):
                raise RuntimeFailure('無法轉換模型提議：參數值必須為文字、布林值或有限數值。', 'action_mapping_failed')
            key = 'number' if name == 'target_number' else name
            if key in arguments:
                raise RuntimeFailure('無法轉換模型提議：電話號碼欄位互相衝突。', 'action_mapping_failed')
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
        source_label = '相機' if frame.source == 'camera' else '上傳的'
        await publish('frame.received', f'已收到一張{source_label}影像（{len(frame.data)} 位元組）。')
        await publish('inference.started', '已將請求送至本機模型服務，開始產生行動提議。')
        response, request_ms = await self.infer(frame, state.scenario_id, state.guard_enabled)
        state.raw_model_text = response.output.raw_text
        state.runtime_metadata = response.model_dump()
        state.timings.update({f'prototype_{key}': value for key, value in response.timing.items()})
        state.timings['prototype_request_ms'] = request_ms
        state.components['vlm'] = 'live'
        semantic = response.policy or response.provenance or {}
        for field in ('semantic_regions', 'retained_evidence_ids', 'denied_instruction_ids', 'user_intent', 'delegation', 'argument_decisions'):
            if field in semantic:
                setattr(state, field, semantic[field])
        if state.semantic_regions:
            state.components['provenance'] = 'semantic_lineage'
            state.components['semantic_grounding'] = (response.provenance or {}).get('semantic_grounding', 'model_perception')
        await publish('inference.completed', '已收到本機模型的實際推論結果。')
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
                f'{detail}請檢查使用者需求並補齊資料，再重新分析。',
                'reservation_details_missing' if missing_only else 'model_schema_invalid',
            )
        if response.output.validation_error is not None:
            # Parsing succeeded, but the Prototype's action normalizer rejected
            # a value (for example an unknown direction). Preserve it for display
            # and stop before either authorization or Guard OFF simulation.
            state.action = self.map_action(response, state.id, candidate=True)
            invalid_message = {
                'provide_direction': '模型提出的方向不明或無法使用。請確認影像中的方向指示後重新分析。',
                'call_phone': '模型提出的電話號碼格式無法使用。請確認號碼後重新分析。',
                'open_url': '模型提出的網址格式無法使用。請確認網址後重新分析。',
            }.get(state.action.tool, '模型提議的行動參數無法使用。請檢查提議內容後重新分析。')
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
                    '模型提議的行動缺少必要參數，或參數格式無效。請檢查提議內容並更新使用者需求後再試。',
                    'model_schema_invalid',
                )
            raise RuntimeFailure('無法解析模型輸出。原始模型文字可在技術詳細資訊中查看。', 'model_output_parse_failed')
        display_response = response
        if not state.guard_enabled and response.output.native_action:
            # The comparison baseline must show the original candidate, never
            # the policy's corrected answer or its grounded provenance.
            display_response = response.model_copy(update={'policy': None,
                'output': response.output.model_copy(update={'proposed_action': response.output.native_action})})
        state.action = self.map_action(display_response, state.id)
        await publish('action.parsed', '模型服務已驗證結構化行動的格式。')
        state.trace_nodes = [TraceNode(id='input', label='影像', type=f'{source_label}影像輸入', source='camera'),
            TraceNode(id='model', label='本機視覺語言模型', type='實際推論', source='model'),
            TraceNode(id='value', label=', '.join(value.value for value in state.action.arguments.values()) or '無參數', type='模型產生，尚未驗證', source='model'),
            TraceNode(id='argument', label=', '.join(f'{state.action.tool}.{key}' for key in state.action.arguments) or state.action.tool, type='行動參數', source='model')]
        state.trace_edges = [TraceEdge(from_='input', to='model'), TraceEdge(from_='model', to='value'), TraceEdge(from_='value', to='argument')]
        if state.semantic_regions:
            state.trace_nodes = [TraceNode(id='input', label='影像', type='camera', source='camera'),
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
            state.trace_nodes.append(TraceNode(id='user', label='使用者需求', type='限定範圍的授權', source='user'))
            state.trace_edges.append(TraceEdge(from_='user', to='argument'))
        await publish('provenance.attached', '已分離觀察／實體的場景依據與不具權限的嵌入指令。' if state.semantic_regions else
                      '已記錄影像傳至模型的來源追溯資訊；目前缺少區域層級的語意依據。')
        if state.guard_enabled:
            if response.policy is None:
                raise RuntimeFailure('授權規則目前無法使用，已暫停自動執行。', 'policy_unavailable')
            state.decision = PolicyDecision.model_validate({key: response.policy[key] for key in PolicyDecision.model_fields if key in response.policy})
            state.decision = state.decision.model_copy(update={'reason': _policy_reason(response.policy)})
            state.components['policy'] = 'live'
            status = 'allowed' if state.decision.result == 'allow' else 'blocked'
            reason = state.decision.reason
            await publish('policy.evaluated', reason)
        else:
            status, reason = 'executed', '防護已關閉：僅模擬執行提議的行動，未獨立驗證攻擊是否成功。'
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
            state.final_answer = dict(text={'right': '出口在右邊。', 'left': '出口在左邊。'}.get(value, value),
                                      value=value, grounded_claim=None, evidence_ids=[])
        state.outcome = RunOutcome(status=status, attack_success=None,
                                   result=state.final_answer.get('value') if state.final_answer else None, detail=reason)
        state.action.status = status
        status_label = {'allowed': '已允許', 'blocked': '已阻擋', 'executed': '已模擬執行'}[status]
        state.trace_nodes.append(TraceNode(id='policy', label=status_label,
            type='觀察依據／回答' if state.action.use == 'INFORMATIONAL_OUTPUT' else '授權／模擬', source='system'))
        state.trace_edges.append(TraceEdge(from_='argument', to='policy'))
        state.status = 'completed'
        state.timings['demo_runtime_ms'] = (perf_counter() - started) * 1000
        await publish(f'action.{status}', reason)
