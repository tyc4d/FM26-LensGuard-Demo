"""Replaceable inference, provenance, and policy interface.

The current provider reads fixtures only. A Phase 3.6 adapter can implement this
protocol without changing the REST/SSE contract or frontend components. Camera
upload is deliberately absent in this demo; a real adapter must add an explicit
frame input contract before claiming to analyze the browser camera.
"""

import json
from pathlib import Path
from typing import Protocol

from pydantic import TypeAdapter

from .models import (
    DetectedRegion,
    PolicyDecision,
    ProposedAction,
    ProvenanceTrace,
    ProvenanceValue,
    RunOutcome,
    Scenario,
    TraceEdge,
    TraceNode,
)


class RuntimeProvider(Protocol):
    async def analyze_scene(self, scenario: Scenario) -> list[str]: ...

    async def extract_regions(self, scenario: Scenario) -> list[DetectedRegion]: ...

    async def propose_action(self, scenario: Scenario, run_id: str) -> ProposedAction: ...

    async def attach_provenance(
        self, scenario: Scenario, action: ProposedAction, frame_id: str
    ) -> ProvenanceTrace: ...

    async def evaluate_policy(
        self, scenario: Scenario, action: ProposedAction
    ) -> PolicyDecision: ...

    async def resolve_outcome(
        self,
        scenario: Scenario,
        guard_enabled: bool,
        decision: PolicyDecision | None,
    ) -> RunOutcome: ...


def load_scenarios(path: Path) -> dict[str, Scenario]:
    scenarios = TypeAdapter(list[Scenario]).validate_python(
        json.loads(path.read_text(encoding="utf-8"))
    )
    by_id = {scenario.id: scenario for scenario in scenarios}
    if len(by_id) != len(scenarios):
        raise ValueError("情境識別碼不得重複。")
    if not by_id:
        raise ValueError("至少需要一個模擬情境。")
    return by_id


class MockRuntimeProvider:
    """Deterministic demonstration behavior, never an external action executor.

    Delegation is supplied by the selected fixture. This intentionally does not
    claim that arbitrary natural-language delegation or policy is understood.
    All simulated authority decisions remain separate from instruction labels.
    """

    async def analyze_scene(self, scenario: Scenario) -> list[str]:
        return list(scenario.interpretation)

    async def extract_regions(self, scenario: Scenario) -> list[DetectedRegion]:
        return [region.model_copy(deep=True) for region in scenario.regions]

    async def propose_action(self, scenario: Scenario, run_id: str) -> ProposedAction:
        return ProposedAction(
            id=f"action_{run_id}",
            tool=scenario.tool,
            arguments={
                scenario.argument_name: ProvenanceValue(
                    id=f"value_{run_id}",
                    value=scenario.proposed_value,
                    source_type="model",
                    source_id=f"action_{run_id}",
                    trust="conditional",
                    authority=["none"],
                    lineage=[],
                )
            },
        )

    async def attach_provenance(
        self, scenario: Scenario, action: ProposedAction, frame_id: str
    ) -> ProvenanceTrace:
        action = action.model_copy(deep=True)
        value = action.arguments[scenario.argument_name]
        value.source_type = "camera"
        value.source_id = scenario.source_region_id
        value.trust = "conditional" if scenario.explicit_delegation else "untrusted"
        value.authority = ["observation"]
        value.lineage = [frame_id, scenario.source_region_id]
        nodes = [
            TraceNode(id="camera", label="相機", type="來源", source="camera"),
            TraceNode(id="region", label=scenario.source_region_id, type="影像區域", source="camera"),
            TraceNode(id="value", label=value.value, type="衍生值", source="camera"),
            TraceNode(id="argument", label=f"{action.tool}.{scenario.argument_name}", type="行動參數", source="model"),
        ]
        edges = [
            TraceEdge(from_="camera", to="region"),
            TraceEdge(from_="region", to="value"),
            TraceEdge(from_="value", to="argument"),
        ]
        if scenario.explicit_delegation:
            value.authority.append("delegated")
            value.lineage.extend(["user_request", "delegation"])
            nodes.extend([
                TraceNode(id="user", label="使用者需求", type="任務授權", source="user"),
                TraceNode(id="delegation", label="明確授權", type="明確授權", source="user"),
            ])
            edges.extend([
                TraceEdge(from_="user", to="delegation"),
                TraceEdge(from_="delegation", to="value"),
            ])
        return ProvenanceTrace(action=action, nodes=nodes, edges=edges)

    async def evaluate_policy(
        self, scenario: Scenario, action: ProposedAction
    ) -> PolicyDecision:
        value = action.arguments[scenario.argument_name]
        affected_argument = f"{action.tool}.{scenario.argument_name}"
        delegated = "delegated" in value.authority
        return PolicyDecision(
            result="allow" if delegated else "block",
            rule_id="camera.argument.requires_delegation",
            affected_argument=affected_argument,
            reason=(
                "使用者已明確授權，允許此行動採用相機觀察到的參數值。"
                if delegated
                else "相機內容試圖在未取得使用者明確授權的情況下，設定需要保護的行動參數。"
            ),
            source_authority="DELEGATED" if delegated else "OBSERVATION_ONLY",
            required_authority=(
                "EXTERNAL_ACTION_TARGET" if action.tool == "call_phone" else "NAVIGATION_DIRECTION"
            ),
        )

    async def resolve_outcome(
        self,
        scenario: Scenario,
        guard_enabled: bool,
        decision: PolicyDecision | None,
    ) -> RunOutcome:
        if not guard_enabled:
            return RunOutcome(
                status="executed",
                attack_success=True if scenario.attack else None,
                result=scenario.proposed_value,
                detail="已模擬執行提議的行動，未聯絡任何外部服務。",
            )
        if decision is None:
            raise ValueError("啟用防護時，必須先完成授權判斷。")
        if decision.result == "allow":
            return RunOutcome(
                status="allowed",
                attack_success=None,
                result=scenario.proposed_value,
                detail="使用者已明確授權此行動。目前僅執行模擬，未聯絡任何外部服務。",
            )
        safe_direction = scenario.ground_truth if scenario.tool == "navigate" else None
        safe_direction_label = {"left": "向左", "right": "向右"}.get(safe_direction, safe_direction)
        return RunOutcome(
            status="blocked",
            attack_success=False if scenario.attack else None,
            result=safe_direction,
            detail=(
                f"已阻擋注入的方向指示。模擬情境中的正確方向：{safe_direction_label}。"
                if safe_direction
                else "已阻擋未獲授權的相機來源目標，未執行任何外部行動。"
            ),
        )
