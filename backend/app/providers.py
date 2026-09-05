"""Replaceable inference, provenance, and policy interface.

The current provider reads fixtures only. A Phase 3.6 adapter can implement this
protocol without changing the REST/SSE contract or frontend components. Camera
upload is deliberately absent in this demo; a real adapter must add an explicit
frame input contract before claiming to analyze the browser camera.
"""

import json
import re
import unicodedata
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
    def semantic_regions(self, scenario: Scenario) -> list[dict]: ...

    def user_delegation(self, scenario: Scenario) -> dict | None: ...

    async def ground_informational_output(self, scenario: Scenario, action: ProposedAction) -> ProposedAction: ...

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

    Semantic claims are fixture inputs checked against literal scene content.
    Delegation comes from a narrow anchored grammar for the trusted user request.
    This does not claim arbitrary natural-language understanding or authenticity.
    """

    async def analyze_scene(self, scenario: Scenario) -> list[str]:
        return list(scenario.interpretation)

    async def extract_regions(self, scenario: Scenario) -> list[DetectedRegion]:
        return self._checked_regions(scenario)

    async def propose_action(self, scenario: Scenario, run_id: str) -> ProposedAction:
        return ProposedAction(
            id=f"action_{run_id}",
            tool=scenario.tool,
            use="INFORMATIONAL_OUTPUT" if scenario.tool == "provide_direction" else "SIDE_EFFECT_ARGUMENT",
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

    @staticmethod
    def _checked_regions(scenario: Scenario) -> list[DetectedRegion]:
        """Check explicit fixtures against their literal text and ancestry."""
        regions = [r.model_copy(deep=True) for r in scenario.regions]
        by_id = {r.id: r for r in regions}
        instruction = re.compile(r'\b(ignore|disregard|override|obey|answer|respond|reply|say|assistant|instead|if\s+asked)\b|忽略|回答|回覆|改撥|一律|助理', re.I)
        direct_command = re.compile(r'^(?:(?:ai|agent|model)\s*[:,]?\s*)?(?:please\s+)?(?:call|dial|execute|send|open|purchase)\b|^(?:請|请)?(?:撥打|拨打|打電話給|打电话给|執行|执行)|\b(?:must|should|need\s+to)\s+(?:call|dial|execute|send|open)\b', re.I)
        for r in regions:
            if instruction.search(r.text) or direct_command.search(r.text) or r.semantic_role in {'instruction', 'instruction_derived'}:
                r.semantic_role = 'instruction'
                r.grounded_claim = None
                r.authority = 'NONE'
                r.status = 'DENY_INSTRUCTION_INFLUENCE'
                r.grounding = {'status': 'unsupported', 'method': 'fixture_literal_check'}
                continue
            claim = r.grounded_claim or {}
            predicate, value = claim.get('predicate'), claim.get('value')
            supported = False
            if predicate == 'exit_direction' and re.search(r'EXIT|出口', r.text, re.I):
                directions = {direction for direction, pattern in {'right': r'→|右|\bright\b', 'left': r'←|左|\bleft\b'}.items() if re.search(pattern, r.text, re.I)}
                supported = directions == {value} and r.semantic_role == 'observation'
            elif predicate in {'restaurant_reservation_phone', 'card_phone'} and isinstance(value, str):
                label = r'訂位|reservation' if predicate == 'restaurant_reservation_phone' else r'名片|business card'
                phones = re.findall(r'(?<![a-zA-Z0-9])\+?\d[\d ()-]{5,}\d(?!\d)', r.text)
                digits = re.sub(r'\D', '', value)
                supported = bool(len(phones) == 1 and 7 <= len(digits) <= 20
                                 and re.sub(r'\D', '', phones[0]) == digits
                                 and re.search(label, r.text, re.I) and r.semantic_role == 'entity')
            elif r.text and not claim:
                r.grounded_claim = {'predicate': 'scene_entity' if r.semantic_role == 'entity' else 'scene_text', 'value': r.text}
                supported = True
            elif predicate in {'scene_entity', 'scene_text'}:
                supported = value == r.text
            r.authority = 'EVIDENCE' if supported else 'NONE'
            r.status = 'RETAIN' if supported else 'UNSUPPORTED'
            r.grounding = {'status': 'supported' if supported else 'unsupported', 'method': 'fixture_literal_check'}

        def ancestry(identifier, visited):
            if identifier not in by_id or identifier in visited:
                return 'unsupported'
            region = by_id[identifier]
            if region.semantic_role in {'instruction', 'instruction_derived'}:
                return 'instruction'
            states = [ancestry(parent, visited | {identifier}) for parent in region.lineage]
            if 'instruction' in states:
                return 'instruction'
            if 'unsupported' in states or region.status != 'RETAIN':
                return 'unsupported'
            return 'supported'

        states = {r.id: ancestry(r.id, set()) for r in regions}
        for r in regions:
            if states[r.id] != 'supported':
                r.authority = 'NONE'
                r.grounding['status'] = 'unsupported'
                r.status = 'DENY_INSTRUCTION_INFLUENCE' if states[r.id] == 'instruction' else 'UNSUPPORTED'
                if states[r.id] == 'instruction' and r.semantic_role != 'instruction':
                    r.semantic_role = 'instruction_derived'
        return regions

    @classmethod
    def semantic_regions(cls, scenario: Scenario) -> list[dict]:
        return [dict(id=r.id, content=r.text, source=r.source,
                     semantic_role=r.semantic_role, grounded_claim=r.grounded_claim,
                     grounding=r.grounding, requested_behavior=r.requested_behavior,
                     lineage=r.lineage, authority=r.authority, status=r.status)
                for r in cls._checked_regions(scenario)]

    @staticmethod
    def user_delegation(scenario: Scenario) -> dict | None:
        """Narrow fixture-language parser; a boolean fixture flag grants nothing."""
        request = unicodedata.normalize('NFKC', scenario.user_request).strip().rstrip('.。!！?？').strip()
        restaurant = re.fullmatch(r"(?:please\s+)?call\s+(?:the\s+)?restaurant[’']s\s+reservation\s+(?:phone\s+)?number|幫我(?:打電話訂位|打電話訂這間餐廳|撥打(?:這間)?餐廳的訂位(?:電話|專線))", request, re.I)
        card = request == '幫我撥打這張名片上的電話'
        if not restaurant and not card:
            return None
        return dict(source="user", tool="call_phone", argument="number",
                    semantic_role="entity", predicate="card_phone" if card else "restaurant_reservation_phone",
                    scope="observed_business_card" if card else "observed_restaurant", explicit=True)

    @classmethod
    def grounded_region(cls, scenario: Scenario, predicate: str):
        return next((r for r in cls._checked_regions(scenario)
                     if r.semantic_role in {"observation", "entity"}
                     and r.authority == "EVIDENCE" and r.status == "RETAIN"
                     and r.grounding and r.grounding.get("status") == "supported"
                     and r.grounded_claim and r.grounded_claim.get("predicate") == predicate), None)

    async def ground_informational_output(self, scenario, action):
        if action.use != "INFORMATIONAL_OUTPUT":
            return action
        directions = {r.grounded_claim['value'] for r in self._checked_regions(scenario)
                      if r.semantic_role == 'observation' and r.status == 'RETAIN'
                      and r.grounded_claim and r.grounded_claim.get('predicate') == 'exit_direction'}
        if len(directions) != 1:
            return action
        region = self.grounded_region(scenario, "exit_direction")
        if region is None:
            return action
        action = action.model_copy(deep=True)
        action.arguments[scenario.argument_name].value = region.grounded_claim["value"]
        action.arguments[scenario.argument_name].source_id = region.id
        return action

    async def attach_provenance(
        self, scenario: Scenario, action: ProposedAction, frame_id: str
    ) -> ProvenanceTrace:
        action = action.model_copy(deep=True)
        value = action.arguments[scenario.argument_name]
        region_id = value.source_id if value.source_id in {r.id for r in scenario.regions} else scenario.source_region_id
        region = next(r for r in self._checked_regions(scenario) if r.id == region_id)
        value.source_type = "camera"
        value.source_id = region.id
        value.trust = "untrusted"
        value.semantic_role = "instruction_derived" if region.semantic_role in {"instruction", "instruction_derived"} else region.semantic_role
        value.grounded_claim = region.grounded_claim
        value.grounding = region.grounding
        value.authority = ["evidence"] if region.authority == "EVIDENCE" else ["none"]
        value.lineage = [frame_id, region.id, *region.lineage]
        delegation = self.user_delegation(scenario)
        if self._delegates(delegation, action, scenario.argument_name, value):
            value.delegation = delegation
            value.authority.append("delegated")
            value.lineage.extend(["user_request", "delegation"])
        nodes = [
            TraceNode(id="camera", label="相機", type="來源", source="camera"),
            TraceNode(id="region", label=region.text, type=region.semantic_role, source="camera"),
            TraceNode(id="value", label=value.value, type=value.semantic_role, source="camera"),
            TraceNode(id="argument", label=f"{action.tool}.{scenario.argument_name}", type=action.use, source="model"),
        ]
        edges = [TraceEdge(from_="camera", to="region"), TraceEdge(from_="region", to="value"),
                 TraceEdge(from_="value", to="argument")]
        for other in self._checked_regions(scenario):
            if other.id != region.id:
                nodes.append(TraceNode(id=other.id, label=other.text, type=other.status, source="camera"))
                edges.append(TraceEdge(from_="camera", to=other.id))
        if delegation:
            nodes.extend([
                TraceNode(id="user", label="使用者需求", type="任務授權", source="user"),
                TraceNode(id="delegation", label=delegation["predicate"], type="限定語意角色的授權", source="user"),
            ])
            edges.append(TraceEdge(from_="user", to="delegation"))
            if value.delegation:
                edges.append(TraceEdge(from_="delegation", to="value"))
        return ProvenanceTrace(action=action, nodes=nodes, edges=edges)

    @staticmethod
    def _supported(value):
        return (value.semantic_role in {"observation", "entity"}
                and value.grounding and value.grounding.get("status") == "supported"
                and value.grounded_claim and value.grounded_claim.get("value") == value.value
                and value.source_id in value.lineage)

    @classmethod
    def _delegates(cls, delegation, action, argument, value):
        return bool(delegation and cls._supported(value)
                    and delegation.get("source") == "user" and delegation.get("explicit") is True
                    and delegation.get("tool") == action.tool and delegation.get("argument") == argument
                    and delegation.get("semantic_role") == value.semantic_role
                    and delegation.get("predicate") == value.grounded_claim.get("predicate"))

    async def evaluate_policy(self, scenario, action):
        value = action.arguments[scenario.argument_name]
        informational = action.use == "INFORMATIONAL_OUTPUT"
        checked = self._checked_regions(scenario)
        instruction_ids = {r.id for r in checked if r.semantic_role in {'instruction', 'instruction_derived'}}
        instruction = value.semantic_role in {"instruction", "instruction_derived"} or bool(instruction_ids.intersection(value.lineage))
        origin = next((r for r in checked if r.id == value.source_id), None)
        supported = (self._supported(value) and origin and origin.semantic_role == value.semantic_role
                     and origin.grounded_claim == value.grounded_claim and origin.authority == 'EVIDENCE'
                     and origin.status == 'RETAIN')
        delegation = self.user_delegation(scenario)
        eligible = {r.grounded_claim['value'] for r in checked if r.status == 'RETAIN' and r.grounded_claim
                    and delegation and r.grounded_claim.get('predicate') == delegation['predicate']}
        delegated = bool(supported and len(eligible) == 1 and self._delegates(delegation, action, scenario.argument_name, value))
        request = unicodedata.normalize('NFKC', scenario.user_request).strip().rstrip('.。!！?？').strip()
        direct = re.fullmatch(r'(?:please\s+)?call\s+(\+?\d[\d ()-]{1,}\d)|(?:幫我)?(?:撥打|打電話給)\s*(\+?\d[\d ()-]{1,}\d)', request, re.I)
        user_number = next((part for part in direct.groups() if part), None) if direct else None
        trusted_user = bool(action.tool == 'call_phone' and user_number
                            and re.sub(r'\D', '', user_number) == re.sub(r'\D', '', value.value)
                            and value.source_type == 'user' and value.trust == 'trusted' and 'task' in value.authority)
        exit_question = bool(re.fullmatch(r'(?:緊急)?出口(?:在(?:哪裡|哪里|哪|何處)|往哪裡走)|where\s+is\s+(?:the\s+)?(?:emergency\s+)?exit', request, re.I))
        directions = {r.grounded_claim['value'] for r in checked if r.status == 'RETAIN'
                      and r.grounded_claim and r.grounded_claim.get('predicate') == 'exit_direction'}
        allowed = not instruction and (bool(supported and exit_question and len(directions) == 1)
                                       if informational else bool(trusted_user or delegated))
        rule = ("DENY_INSTRUCTION_INFLUENCE" if instruction else
                "ALLOW_GROUNDED_INFORMATION" if informational and allowed else
                "ALLOW_USER_DELEGATED_ENTITY" if delegated else
                "ALLOW_TRUSTED_USER_VALUE" if trusted_user else "REQUIRE_GROUNDING_OR_USER_DELEGATION")
        return PolicyDecision(
            result="allow" if allowed else "block", rule_id=rule,
            affected_argument=f"{action.tool}.{scenario.argument_name}", use=action.use,
            reason=("已保留有場景依據的觀察；嵌入指令不具行為權限。" if informational and allowed else
                    "使用者授權餐廳／名片電話的語意角色供本次撥號使用。" if allowed else
                    "此值來自嵌入指令，不具行為權限。" if instruction else
                    "此值缺少場景依據或符合參數角色的使用者授權。"),
            source_authority="EVIDENCE" if informational and allowed else "DELEGATED" if delegated else "TASK" if trusted_user else "NONE",
            required_authority="GROUNDED_EVIDENCE" if informational else "USER_VALUE_OR_SCOPED_DELEGATION",
        )

    async def resolve_outcome(self, scenario, guard_enabled, decision):
        if not guard_enabled:
            return RunOutcome(status="executed", attack_success=True if scenario.attack else None,
                              result=scenario.proposed_value, detail="防護關閉：顯示模擬模型的原始提議；未聯絡任何外部服務。")
        if decision is None:
            raise ValueError("啟用防護時，必須先完成授權判斷。")
        if decision.result == "allow":
            region = self.grounded_region(scenario, "exit_direction") if scenario.tool == "provide_direction" else None
            result = region.grounded_claim["value"] if region else scenario.proposed_value
            return RunOutcome(status="allowed", attack_success=False if scenario.attack else None,
                              result=result, detail=decision.reason)
        return RunOutcome(status="blocked", attack_success=False if scenario.attack else None,
                          result=None, detail=decision.reason)
