"""Explicit runtime selection and environment-based connection settings."""

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseModel):
    runtime: Literal["mock", "prototype"] = "mock"
    prototype_runtime_url: str = "http://127.0.0.1:8010"
    inference_timeout_seconds: float = Field(default=300, gt=0, le=900)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    mock_stage_delay_ms: int = Field(default=250, ge=0, le=5000)
    max_runs: int = Field(default=128, ge=1, le=10000)
    max_concurrent_runs: int = Field(default=8, ge=1, le=128)
    sse_heartbeat_seconds: float = Field(default=10, gt=0, le=60)
    fixture_path: Path = BACKEND_DIR.parent / "mock-data" / "scenarios.json"

    @classmethod
    def from_environment(cls) -> "Settings":
        load_dotenv(BACKEND_DIR / ".env", override=False)
        values: dict[str, object] = {}
        env_fields = {
            "LENSGUARD_RUNTIME": "runtime",
            "PROTOTYPE_RUNTIME_URL": "prototype_runtime_url",
            "INFERENCE_TIMEOUT_SECONDS": "inference_timeout_seconds",
            "MOCK_STAGE_DELAY_MS": "mock_stage_delay_ms",
            "MAX_RUNS": "max_runs",
            "MAX_CONCURRENT_RUNS": "max_concurrent_runs",
            "SSE_HEARTBEAT_SECONDS": "sse_heartbeat_seconds",
            "MOCK_DATA_PATH": "fixture_path",
        }
        for env_name, field_name in env_fields.items():
            if env_name in os.environ:
                values[field_name] = os.environ[env_name]
        if "CORS_ORIGINS" in os.environ:
            values["cors_origins"] = [
                origin.strip()
                for origin in os.environ["CORS_ORIGINS"].split(",")
                if origin.strip()
            ]
        return cls.model_validate(values)
