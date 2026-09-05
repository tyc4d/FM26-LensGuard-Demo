"""In-memory orchestration with immutable event snapshots and SSE replay."""

import asyncio
import logging
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

from .config import Settings
from .models import RunState, RuntimeEvent, Scenario, TraceEdge, TraceNode
from .providers import RuntimeProvider
from .prototype_provider import FrameInput, PrototypeRuntimeProvider, RuntimeFailure

logger = logging.getLogger(__name__)


class RuntimeCapacityError(Exception):
    pass


@dataclass
class RunRecord:
    state: RunState
    history: list[RunState] = field(default_factory=list)
    changed: asyncio.Condition = field(default_factory=asyncio.Condition)


class DemoRuntime:
    """Single-process runtime: one task per run, with bounded run retention."""

    def __init__(self, settings: Settings, provider: RuntimeProvider):
        self.settings = settings
        self.provider = provider
        self.records: OrderedDict[str, RunRecord] = OrderedDict()
        self.tasks: set[asyncio.Task] = set()
        self.frame_counter = 0
        self.closing = False

    def start(self, scenario: Scenario, guard_enabled: bool, frame: FrameInput | None = None) -> RunState:
        active = sum(record.state.status == "running" for record in self.records.values())
        if self.closing or active >= self.settings.max_concurrent_runs:
            raise RuntimeCapacityError("展示系統忙碌中，請等目前的分析完成後再試。")
        while len(self.records) >= self.settings.max_runs:
            oldest_terminal = next(
                (key for key, record in self.records.items() if record.state.status != "running"),
                None,
            )
            if oldest_terminal is None:
                raise RuntimeCapacityError("展示系統忙碌中，請等目前的分析完成後再試。")
            del self.records[oldest_terminal]
        run_id = f"run_{uuid4().hex[:16]}"
        state = RunState(id=run_id, scenario_id=scenario.id, guard_enabled=guard_enabled, runtime="prototype" if isinstance(self.provider, PrototypeRuntimeProvider) else "mock")
        record = RunRecord(state=state)
        self.records[run_id] = record
        self.frame_counter += 1
        task = asyncio.create_task(
            self._run(record, scenario.model_copy(deep=True), f"frame_{self.frame_counter:04d}", frame),
            name=run_id,
        )
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return state.model_copy(deep=True)

    def get_record(self, run_id: str) -> RunRecord | None:
        return self.records.get(run_id)

    async def _pause(self) -> None:
        await asyncio.sleep(self.settings.mock_stage_delay_ms / 1000)

    async def _publish(self, record: RunRecord, event_type: str, detail: str) -> None:
        async with record.changed:
            state = record.state
            state.stage = event_type
            state.events.append(RuntimeEvent(
                id=f"{state.id}:{len(state.events) + 1}",
                timestamp=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                type=event_type,
                detail=detail,
            ))
            record.history.append(state.model_copy(deep=True))
            record.changed.notify_all()

    async def _run(self, record: RunRecord, scenario: Scenario, frame_id: str, frame: FrameInput | None = None) -> None:
        state = record.state
        try:
            state.frame_id = frame_id
            if isinstance(self.provider, PrototypeRuntimeProvider):
                if frame is None:
                    raise RuntimeFailure("尚未提供影像，請啟動相機或上傳圖片。")
                await self.provider.run(state, frame, lambda kind, detail: self._publish(record, kind, detail))
                return
            await self._publish(record, "frame.received", f"已載入模擬影格 {frame_id}；瀏覽器中的即時影像仍保留在本機。")

            await self._pause()
            state.interpretation = await self.provider.analyze_scene(scenario)
            await self._publish(record, "perception.scene_analyzed", "已載入所選模擬情境的場景解讀。")

            await self._pause()
            state.regions = await self.provider.extract_regions(scenario)
            state.semantic_regions = self.provider.semantic_regions(scenario)
            state.retained_evidence_ids = [r['id'] for r in state.semantic_regions if r['status'] == 'RETAIN']
            state.denied_instruction_ids = [r['id'] for r in state.semantic_regions if r['status'] == 'DENY_INSTRUCTION_INFLUENCE']
            state.user_intent = scenario.user_intent
            state.delegation = self.provider.user_delegation(scenario)
            await self._publish(record, "perception.text_extracted", f"已從模擬資料載入 {len(state.regions)} 個相機來源區域。")

            await self._pause()
            state.action = await self.provider.propose_action(scenario, state.id)
            tool_label = {"call_phone": "撥打電話", "provide_direction": "回答方向"}.get(state.action.tool, state.action.tool)
            argument_labels = {"number": "電話號碼", "direction": "方向"}
            arguments = "、".join(f'{argument_labels.get(name, name)}="{value.value}"' for name, value in state.action.arguments.items())
            await self._publish(record, "model.action_proposed", f"模擬模型已提出行動：{tool_label}（{arguments}）。")

            await self._pause()
            if state.guard_enabled:
                state.action = await self.provider.ground_informational_output(scenario, state.action)
            trace = await self.provider.attach_provenance(scenario, state.action, frame_id)
            state.action = trace.action
            state.trace_nodes = trace.nodes
            state.trace_edges = trace.edges
            await self._publish(record, "provenance.attached", "已保留觀察／實體的場景依據，並分離不具權限的嵌入指令。")

            await self._pause()
            if state.guard_enabled:
                state.decision = await self.provider.evaluate_policy(scenario, state.action)
                if state.action.use == 'SIDE_EFFECT_ARGUMENT':
                    for region in scenario.regions:
                        if region.grounded_claim and region.grounded_claim.get('predicate') in {'restaurant_reservation_phone', 'card_phone'}:
                            candidate = state.action.model_copy(deep=True)
                            candidate.arguments[scenario.argument_name].value = region.grounded_claim['value']
                            candidate.arguments[scenario.argument_name].source_id = region.id
                            candidate = (await self.provider.attach_provenance(scenario, candidate, frame_id)).action
                            candidate_decision = await self.provider.evaluate_policy(scenario, candidate)
                            state.argument_decisions.append(dict(value=region.grounded_claim['value'], source_id=region.id,
                                semantic_role=region.semantic_role, **candidate_decision.model_dump()))
                    candidate_value = state.action.arguments[scenario.argument_name]
                    if not any(item['source_id'] == candidate_value.source_id for item in state.argument_decisions):
                        state.argument_decisions.append(dict(value=candidate_value.value, source_id=candidate_value.source_id,
                            semantic_role=candidate_value.semantic_role, **state.decision.model_dump()))
                policy_label = "允許" if state.decision.result == "allow" else "拒絕"
                event_type = "policy.evaluated"
                detail = f"{policy_label}：{state.decision.reason}"
            else:
                policy_label = "略過檢查"
                event_type = "policy.bypassed"
                detail = "LensGuard 防護已關閉；本次模擬略過授權檢查。"
            state.trace_nodes.append(TraceNode(id="policy", label=policy_label, type="授權判斷", source="system"))
            state.trace_edges.append(TraceEdge(from_="argument", to="policy"))
            await self._publish(record, event_type, detail)

            await self._pause()
            state.outcome = await self.provider.resolve_outcome(scenario, state.guard_enabled, state.decision)
            if state.action.use == 'INFORMATIONAL_OUTPUT' and state.outcome.result:
                value = state.action.arguments[scenario.argument_name]
                state.final_answer = dict(text={'right': '出口在右邊。', 'left': '出口在左邊。'}.get(state.outcome.result, state.outcome.result),
                                          value=state.outcome.result, grounded_claim=value.grounded_claim,
                                          evidence_ids=[value.source_id] if value.semantic_role == 'observation' else [])
            state.action.status = state.outcome.status
            outcome_label = {"allowed": "已允許", "blocked": "已阻擋", "executed": "已模擬執行"}[state.outcome.status]
            state.trace_nodes.append(TraceNode(id="outcome", label=outcome_label, type="模擬結果", source="system"))
            state.trace_edges.append(TraceEdge(from_="policy", to="outcome"))
            state.status = "completed"
            await self._publish(record, f"action.{state.outcome.status}", state.outcome.detail)
        except asyncio.CancelledError:
            await self._cancelled(record)
            raise
        except RuntimeFailure as exc:
            state.status = "failed"
            state.error = str(exc)
            state.error_code = exc.code
            if exc.diagnostics is not None:
                state.runtime_metadata['upstream_error'] = exc.diagnostics
            if state.decision is None:
                state.components["policy"] = "not_evaluated"
            await self._publish(record, "runtime.failed", state.error)
        except Exception:
            logger.exception("Runtime provider failed for %s at %s", state.id, state.stage)
            state.status = "failed"
            state.error = "分析失敗，請重設展示後再試；詳細原因可查看後端紀錄。"
            await self._publish(record, "runtime.failed", state.error)

    async def _cancelled(self, record: RunRecord) -> None:
        record.state.status = "failed"
        record.state.error = "分析完成前後端已停止，請重新連線後開始新的分析。"
        await self._publish(record, "runtime.cancelled", record.state.error)

    async def close(self) -> None:
        self.closing = True
        tasks = list(self.tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        # A task cancelled before its first scheduling turn cannot execute its
        # own exception handler. It still needs a terminal state for consumers.
        for record in self.records.values():
            if record.state.status == "running":
                await self._cancelled(record)
