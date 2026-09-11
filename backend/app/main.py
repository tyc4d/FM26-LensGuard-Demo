"""REST commands and an SSE snapshot stream for the LensGuard runtime."""

import asyncio
from time import perf_counter
from pydantic import ValidationError
from starlette.datastructures import UploadFile
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import Settings
from .models import Health, RunRequest, RunState, Scenario
from .providers import MockRuntimeProvider, RuntimeProvider, load_scenarios
from .prototype_provider import PrototypeRuntimeProvider, FrameInput
from .runtime import DemoRuntime, RunRecord, RuntimeCapacityError


def create_app(
    settings: Settings | None = None,
    provider: RuntimeProvider | None = None,
) -> FastAPI:
    settings = settings or Settings.from_environment()
    scenarios = load_scenarios(settings.fixture_path)
    provider = provider or (PrototypeRuntimeProvider(settings.prototype_runtime_url, settings.inference_timeout_seconds) if settings.runtime == "prototype" else MockRuntimeProvider())

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.runtime = DemoRuntime(settings, provider)
        try:
            yield
        finally:
            await application.state.runtime.close()

    application = FastAPI(
        title="LensGuard Demo API",
        description="Choose mock or local model mode explicitly; all actions are simulated.",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Last-Event-ID"],
    )

    def record_for(request: Request, run_id: str) -> RunRecord:
        record = request.app.state.runtime.get_record(run_id)
        if record is None:
            raise HTTPException(status_code=404, detail="This analysis record was not found or has expired.")
        return record

    @application.get("/api/health", response_model=Health, response_model_exclude_none=True)
    async def health() -> Health:
        if isinstance(provider, PrototypeRuntimeProvider):
            remote = await provider.health()
            return Health(runtime="prototype", model="live" if remote.get("model_loaded") else str(remote.get("status", "unavailable")), prototype=remote)
        return Health()

    @application.get("/api/scenarios", response_model=list[Scenario])
    async def list_scenarios() -> list[Scenario]:
        return list(scenarios.values())

    @application.post("/api/run", response_model=RunState, status_code=status.HTTP_202_ACCEPTED)
    async def start_run(request: Request) -> RunState:
        started = perf_counter()
        frame = None
        try:
            if request.headers.get('content-type', '').startswith('multipart/form-data'):
                async with request.form(max_files=1, max_fields=8, max_part_size=10 * 1024 * 1024) as form:
                    guard = form.get('guard_enabled')
                    if guard not in ('true', 'false'):
                        raise HTTPException(422, 'The guard setting must be true or false.')
                    body = RunRequest(scenario_id=form.get('scenario_id'), guard_enabled=guard == 'true',
                                      model_profile=form.get('model_profile'))
                    image = form.get('image')
                    user_request = form.get('user_request')
                    if not isinstance(image, UploadFile) or image.content_type not in ('image/jpeg', 'image/png'):
                        raise HTTPException(422, 'Image missing or unsupported. Provide a JPEG or PNG image.')
                    data = await image.read(10 * 1024 * 1024 + 1)
                    if not data or len(data) > 10 * 1024 * 1024:
                        raise HTTPException(413, 'The image must be nonempty and no larger than 10 MiB.')
                    if not isinstance(user_request, str) or not user_request.strip() or len(user_request) > 4000:
                        raise HTTPException(422, 'Enter a nonempty user request of no more than 4,000 characters.')
                    source = form.get('source', 'camera')
                    capture_ms = float(str(form.get('capture_ms', '0')))
                    if source not in ('camera', 'uploaded_image') or not 0 <= capture_ms <= 60000:
                        raise HTTPException(422, 'Invalid image source or capture time.')
                    frame = FrameInput(data, image.content_type, user_request, source, capture_ms,
                                       (perf_counter() - started) * 1000, body.model_profile)
            else:
                body = RunRequest.model_validate(await request.json())
        except (ValidationError, ValueError, TypeError) as exc:
            raise HTTPException(422, 'Invalid analysis request format. Check the input and try again.') from exc
        if isinstance(provider, PrototypeRuntimeProvider) and frame is None:
            raise HTTPException(422, 'No image provided. Local model mode requires a camera frame or uploaded image.')
        if body.model_profile is not None and not isinstance(provider, PrototypeRuntimeProvider):
            raise HTTPException(422, 'Model selection is only available for live analysis.')
        scenario = scenarios.get(body.scenario_id)
        if scenario is None:
            raise HTTPException(status_code=404, detail="The requested demo scenario was not found.")
        try:
            return request.app.state.runtime.start(scenario, body.guard_enabled, frame)
        except RuntimeCapacityError as exc:
            raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": "2"}) from exc

    @application.get("/api/run/{run_id}", response_model=RunState)
    async def get_run(run_id: str, request: Request) -> RunState:
        return record_for(request, run_id).state.model_copy(deep=True)

    @application.get("/api/run/{run_id}/events")
    async def run_events(
        run_id: str,
        request: Request,
        last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
    ) -> StreamingResponse:
        record = record_for(request, run_id)

        async def stream():
            cursor = 0
            if last_event_id:
                cursor = next(
                    (index + 1 for index, snapshot in enumerate(record.history)
                     if snapshot.events[-1].id == last_event_id),
                    0,
                )
            # Explicit retry hint; native EventSource reconnects without a frontend timer.
            yield "retry: 1000\n\n"
            while True:
                if await request.is_disconnected():
                    return
                async with record.changed:
                    pending = record.history[cursor:]
                    terminal = record.state.status != "running"
                    if not pending and not terminal:
                        try:
                            await asyncio.wait_for(
                                record.changed.wait(), timeout=settings.sse_heartbeat_seconds
                            )
                        except TimeoutError:
                            pass
                        pending = record.history[cursor:]
                        terminal = record.state.status != "running"
                if not pending:
                    if terminal:
                        return
                    yield ": keepalive\n\n"
                    continue
                for snapshot in pending:
                    event_id = snapshot.events[-1].id
                    yield f"id: {event_id}\nevent: runtime\ndata: {snapshot.model_dump_json(by_alias=True)}\n\n"
                    cursor += 1
                if terminal:
                    return

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    return application


app = create_app()
