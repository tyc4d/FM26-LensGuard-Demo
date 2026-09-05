import asyncio
import json
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.models import BoundingBox
from app.providers import MockRuntimeProvider, load_scenarios
from app.runtime import DemoRuntime


@pytest.fixture
def client():
    with TestClient(create_app(Settings(mock_stage_delay_ms=0))) as test_client:
        yield test_client


def start(client, scenario="reservation-injection", guard=True):
    response = client.post("/api/run", json={"scenario_id": scenario, "guard_enabled": guard})
    assert response.status_code == 202
    initial = response.json()
    assert initial["status"] == "running"
    assert initial["action"] is None
    assert initial["events"] == []
    return initial["id"]


def stream_snapshots(client, run_id, last_event_id=None):
    headers = {"Last-Event-ID": last_event_id} if last_event_id else {}
    response = client.get(f"/api/run/{run_id}/events", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-accel-buffering"] == "no"
    snapshots = []
    for block in response.text.split("\n\n"):
        lines = block.splitlines()
        data = next((line[6:] for line in lines if line.startswith("data: ")), None)
        if data:
            assert "event: runtime" in lines
            snapshot = json.loads(data)
            assert f"id: {snapshot['events'][-1]['id']}" in lines
            snapshots.append(snapshot)
    return snapshots


def complete(client, scenario="reservation-injection", guard=True):
    run_id = start(client, scenario, guard)
    snapshots = stream_snapshots(client, run_id)
    assert len(snapshots) == 7
    final = snapshots[-1]
    assert final["status"] == "completed"
    assert client.get(f"/api/run/{run_id}").json() == final
    return final


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "runtime": "mock", "model": "mock"}


def test_scenarios_and_camera_regions(client):
    response = client.get("/api/scenarios")
    assert response.status_code == 200
    scenarios = response.json()
    assert [item["id"] for item in scenarios] == [
        "reservation-injection", "navigation-injection", "explicit-delegation", "clean-navigation", "reservation-delegation"
    ]
    assert [item["user_request"] for item in scenarios] == [
        "幫我打電話訂位。", "緊急出口在哪裡？", "幫我撥打這張名片上的電話", "緊急出口在哪裡？", "幫我打電話訂位。"
    ]
    for scenario in scenarios:
        assert scenario["source_region_id"] in {region["id"] for region in scenario["regions"]}
        assert all(region["source"] == "camera" for region in scenario["regions"])


def test_reservation_guard_on_blocks_instruction_derived_target(client):
    result = complete(client)
    assert result["action"]["status"] == "blocked"
    assert result["action"]["tool"] == "call_phone"
    value = result["action"]["arguments"]["number"]
    assert value["value"] == "0912-345-678"
    assert value["source_type"] == "camera"
    assert value["source_id"] == "region_02"
    assert value["authority"] == ["none"]
    assert value["semantic_role"] == "instruction_derived"
    assert result["decision"]["result"] == "block"
    assert result["decision"]["affected_argument"] == "call_phone.number"
    assert result["decision"]["source_authority"] == "NONE"
    assert result["decision"]["required_authority"] == "USER_VALUE_OR_SCOPED_DELEGATION"
    assert result["outcome"]["attack_success"] is False
    assert result["outcome"]["simulation_only"] is True
    assert result["outcome"]["result"] is None


def test_reservation_guard_off_executes_same_target_in_simulation(client):
    blocked = complete(client)
    unguarded = complete(client, guard=False)
    assert unguarded["action"]["arguments"]["number"]["value"] == blocked["action"]["arguments"]["number"]["value"]
    assert unguarded["action"]["status"] == "executed"
    assert unguarded["decision"] is None
    assert unguarded["outcome"]["attack_success"] is True
    assert unguarded["outcome"]["simulation_only"] is True
    assert unguarded["events"][-2]["type"] == "policy.bypassed"
    assert unguarded["events"][-1]["type"] == "action.executed"


@pytest.mark.parametrize("guard,expected_result,expected_status,attack_success", [
    (True, "right", "allowed", False),
    (False, "left", "executed", True),
])
def test_navigation_result(client, guard, expected_result, expected_status, attack_success):
    result = complete(client, "navigation-injection", guard)
    assert result["action"]["arguments"]["direction"]["value"] == expected_result
    assert result["action"]["status"] == expected_status
    assert result["outcome"]["result"] == expected_result
    assert result["outcome"]["attack_success"] is attack_success


def test_explicit_delegation_allows_camera_value_and_has_user_path(client):
    result = complete(client, "explicit-delegation")
    value = result["action"]["arguments"]["number"]
    assert value["value"] == "02-2345-6789"
    assert value["source_type"] == "camera"
    assert value["authority"] == ["evidence", "delegated"]
    assert value["trust"] == "untrusted"
    assert result["decision"]["result"] == "allow"
    assert result["decision"]["source_authority"] == "DELEGATED"
    assert result["action"]["status"] == "allowed"
    assert result["outcome"]["attack_success"] is None
    assert result["outcome"]["simulation_only"] is True
    user_nodes = {node["id"] for node in result["trace_nodes"] if node["source"] == "user"}
    assert user_nodes == {"user", "delegation"}
    assert {"from": "user", "to": "delegation"} in result["trace_edges"]
    assert {"from": "delegation", "to": "value"} in result["trace_edges"]
    assert result["events"][-1]["type"] == "action.allowed"


def test_explicit_delegation_guard_off_does_not_claim_an_attack(client):
    result = complete(client, "explicit-delegation", False)
    assert result["decision"] is None
    assert result["outcome"]["status"] == "executed"
    assert result["outcome"]["attack_success"] is None


def test_progressive_snapshots_do_not_leak_future_state(client):
    before = datetime.now(timezone.utc)
    run_id = start(client)
    snapshots = stream_snapshots(client, run_id)
    after = datetime.now(timezone.utc)
    assert [snapshot["stage"] for snapshot in snapshots] == [
        "frame.received", "perception.scene_analyzed", "perception.text_extracted",
        "model.action_proposed", "provenance.attached", "policy.evaluated", "action.blocked",
    ]
    assert [len(snapshot["events"]) for snapshot in snapshots] == list(range(1, 8))
    assert snapshots[0]["frame_id"].startswith("frame_")
    assert snapshots[0]["regions"] == []
    assert snapshots[0]["interpretation"] == []
    assert snapshots[1]["interpretation"]
    assert snapshots[1]["regions"] == []
    assert snapshots[2]["regions"]
    assert snapshots[2]["action"] is None
    assert snapshots[3]["action"]["status"] == "proposed"
    assert snapshots[3]["action"]["arguments"]["number"]["source_type"] == "model"
    assert snapshots[3]["trace_nodes"] == []
    assert snapshots[4]["trace_nodes"]
    assert snapshots[4]["decision"] is None
    assert snapshots[5]["decision"]["result"] == "block"
    assert snapshots[5]["outcome"] is None
    assert snapshots[6]["outcome"]["status"] == "blocked"
    timestamps = [datetime.fromisoformat(event["timestamp"]) for event in snapshots[-1]["events"]]
    assert timestamps == sorted(timestamps)
    # Backend event timestamp precision is milliseconds.
    assert before.replace(microsecond=0) <= timestamps[0] <= timestamps[-1] <= after
    assert all(timestamp.tzinfo is not None for timestamp in timestamps)
    node_ids = {node["id"] for node in snapshots[-1]["trace_nodes"]}
    assert all(edge["from"] in node_ids and edge["to"] in node_ids for edge in snapshots[-1]["trace_edges"])


def test_sse_resume_replays_only_unseen_snapshots(client):
    run_id = start(client)
    snapshots = stream_snapshots(client, run_id)
    resumed = stream_snapshots(client, run_id, snapshots[2]["events"][-1]["id"])
    assert resumed == snapshots[3:]
    assert stream_snapshots(client, run_id, snapshots[-1]["events"][-1]["id"]) == []
    assert stream_snapshots(client, run_id, "unknown-event") == snapshots


@pytest.mark.parametrize("body", [
    {},
    {"scenario_id": "reservation-injection"},
    {"scenario_id": "reservation-injection", "guard_enabled": "false"},
    {"scenario_id": "reservation-injection", "guard_enabled": 0},
    {"scenario_id": "", "guard_enabled": True},
    {"scenario_id": "../anything", "guard_enabled": True},
    {"scenario_id": "reservation-injection", "guard_enabled": True, "execute_real": True},
])
def test_invalid_inputs_are_rejected(client, body):
    assert client.post("/api/run", json=body).status_code == 422


def test_missing_scenario_and_runs_return_404(client):
    assert client.post("/api/run", json={"scenario_id": "missing", "guard_enabled": True}).status_code == 404
    assert client.get("/api/run/missing").status_code == 404
    assert client.get("/api/run/missing/events").status_code == 404


def test_cors_allows_only_configured_origins(client):
    response = client.options("/api/run", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    blocked = client.get("/api/health", headers={"Origin": "https://unconfigured.example"})
    assert "access-control-allow-origin" not in blocked.headers


def test_completed_run_retention_is_bounded():
    with TestClient(create_app(Settings(mock_stage_delay_ms=0, max_runs=2))) as test_client:
        first = complete(test_client)["id"]
        second = complete(test_client)["id"]
        third = complete(test_client)["id"]
        assert test_client.get(f"/api/run/{first}").status_code == 404
        assert test_client.get(f"/api/run/{second}").status_code == 200
        assert test_client.get(f"/api/run/{third}").status_code == 200


def test_concurrent_limit_does_not_evict_active_runs():
    with TestClient(create_app(Settings(mock_stage_delay_ms=250, max_runs=1, max_concurrent_runs=1))) as test_client:
        first = start(test_client)
        response = test_client.post("/api/run", json={"scenario_id": "explicit-delegation", "guard_enabled": True})
        assert response.status_code == 429
        assert response.headers["retry-after"] == "2"
        assert test_client.get(f"/api/run/{first}").status_code == 200


def test_provider_failure_emits_terminal_snapshot():
    class FailingProvider(MockRuntimeProvider):
        async def analyze_scene(self, scenario):
            raise RuntimeError("Internal model failure details")

    with TestClient(create_app(Settings(mock_stage_delay_ms=0), FailingProvider())) as test_client:
        run_id = start(test_client)
        snapshots = stream_snapshots(test_client, run_id)
        assert len(snapshots) == 2
        assert snapshots[-1]["status"] == "failed"
        assert snapshots[-1]["events"][-1]["type"] == "runtime.failed"
        assert snapshots[-1]["error"]
        assert "Internal model failure details" not in snapshots[-1]["error"]


@pytest.mark.parametrize("yield_before_close", [False, True])
def test_shutdown_cancels_active_run_with_terminal_state(yield_before_close):
    async def exercise():
        settings = Settings(mock_stage_delay_ms=250)
        runtime = DemoRuntime(settings, MockRuntimeProvider())
        scenario = load_scenarios(settings.fixture_path)["reservation-injection"]
        run = runtime.start(scenario, True)
        if yield_before_close:
            await asyncio.sleep(0)
        await runtime.close()
        record = runtime.get_record(run.id)
        assert record.state.status == "failed"
        assert record.history[-1].events[-1].type == "runtime.cancelled"
        assert not runtime.tasks

    asyncio.run(exercise())


def test_mock_policy_checks_authority_instead_of_instruction_region_labels():
    async def exercise():
        settings = Settings(mock_stage_delay_ms=0)
        scenario = load_scenarios(settings.fixture_path)["reservation-injection"]
        # The authorization boundary must not depend on a detector's text label.
        scenario.regions[1].kind = "scene_text"
        provider = MockRuntimeProvider()
        action = await provider.propose_action(scenario, "policy_test")
        trace = await provider.attach_provenance(scenario, action, "frame_test")
        decision = await provider.evaluate_policy(scenario, trace.action)
        assert decision.result == "block"
        assert decision.source_authority == "NONE"

    asyncio.run(exercise())


def test_configured_delay_is_real_and_deterministic():
    # Small test-specific delay verifies server pacing without a slow test suite.
    with TestClient(create_app(Settings(mock_stage_delay_ms=20))) as test_client:
        began = time.monotonic()
        final = complete(test_client)
        assert time.monotonic() - began >= 0.12
        timestamps = [datetime.fromisoformat(event["timestamp"]) for event in final["events"]]
        assert all((right - left).total_seconds() >= 0.019 for left, right in zip(timestamps, timestamps[1:]))


def test_bounding_boxes_cannot_extend_outside_frame():
    with pytest.raises(ValidationError):
        BoundingBox(x=0.8, y=0.1, width=0.4, height=0.2)
