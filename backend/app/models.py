"""Validated runtime contract, mirrored by frontend/src/types.ts."""

from typing import Literal, Any

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

SourceType = Literal["user", "camera", "model", "system"]
Authority = Literal["task", "observation", "delegated", "none"]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class BoundingBox(Schema):
    """Coordinates are normalized relative to the entire video frame."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def fits_frame(self) -> "BoundingBox":
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("Bounding box must fit within the normalized frame")
        return self


class ProvenanceValue(Schema):
    id: str
    value: str
    source_type: SourceType
    source_id: str
    trust: Literal["trusted", "untrusted", "conditional"]
    authority: list[Authority]
    lineage: list[str]


class DetectedRegion(Schema):
    id: str
    text: str
    kind: Literal["scene_text", "instruction_like", "entity"]
    bbox: BoundingBox
    source: Literal["camera"] = "camera"


class ProposedAction(Schema):
    id: str
    tool: str
    arguments: dict[str, ProvenanceValue]
    status: Literal["proposed", "allowed", "blocked", "executed"] = "proposed"


class PolicyDecision(Schema):
    result: Literal["allow", "block"]
    rule_id: str
    affected_argument: str
    reason: str
    source_authority: str
    required_authority: str


class RuntimeEvent(Schema):
    id: str
    timestamp: str
    type: str
    detail: str


class TraceNode(Schema):
    id: str
    label: str
    type: str
    source: SourceType | None = None


class TraceEdge(Schema):
    from_: str = Field(alias="from")
    to: str


class ProvenanceTrace(Schema):
    action: ProposedAction
    nodes: list[TraceNode]
    edges: list[TraceEdge]


class Scenario(Schema):
    id: str
    name: str
    description: str
    user_request: str
    interpretation: list[str]
    regions: list[DetectedRegion]
    tool: str
    argument_name: str
    proposed_value: str
    source_region_id: str
    ground_truth: str | None
    explicit_delegation: bool
    attack: bool

    @model_validator(mode="after")
    def valid_regions(self) -> "Scenario":
        region_ids = [region.id for region in self.regions]
        if len(region_ids) != len(set(region_ids)):
            raise ValueError("Region IDs must be unique within a scenario")
        if self.source_region_id not in region_ids:
            raise ValueError("The proposed value must reference an observed region")
        return self


class RunOutcome(Schema):
    status: Literal["allowed", "blocked", "executed"]
    simulation_only: bool = True
    attack_success: bool | None
    result: str | None
    detail: str


class RunState(Schema):
    runtime: Literal["mock", "prototype"] = "mock"
    raw_model_text: str | None = None
    timings: dict[str, float] = Field(default_factory=dict)
    components: dict[str, str] = Field(default_factory=dict)
    runtime_metadata: dict[str, Any] = Field(default_factory=dict)
    id: str
    scenario_id: str
    guard_enabled: bool
    status: Literal["running", "completed", "failed"] = "running"
    stage: str = "queued"
    frame_id: str | None = None
    regions: list[DetectedRegion] = Field(default_factory=list)
    interpretation: list[str] = Field(default_factory=list)
    action: ProposedAction | None = None
    decision: PolicyDecision | None = None
    trace_nodes: list[TraceNode] = Field(default_factory=list)
    trace_edges: list[TraceEdge] = Field(default_factory=list)
    outcome: RunOutcome | None = None
    events: list[RuntimeEvent] = Field(default_factory=list)
    error: str | None = None


class RunRequest(Schema):
    scenario_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
    guard_enabled: StrictBool


class Health(Schema):
    status: Literal["ok"] = "ok"
    runtime: Literal["mock", "prototype"] = "mock"
    model: str = "mock"
    prototype: dict[str, Any] | None = None
