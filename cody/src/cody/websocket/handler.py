"""WebSocket event handler - port of ipc-handlers.ts.

Follows Single Responsibility Principle by delegating session business
logic to SessionService and focusing on WebSocket protocol handling.
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

from ..claude.runner import ClaudeRunner
from ..sessions.models import Session, SessionStatus
from ..sessions.service import SessionService
from ..sessions.store import SessionStore
from .events import (
    PermissionRequestPayload,
    PermissionResponsePayload,
    RunnerErrorPayload,
    ServerEvent,
    SessionContinuePayload,
    SessionDeletedPayload,
    SessionDeletePayload,
    SessionHistoryPayload,
    SessionHistoryResponsePayload,
    SessionListPayload,
    SessionStartPayload,
    SessionStatusPayload,
    SessionStopPayload,
    StreamMessagePayload,
    StreamUserPromptPayload,
)
from .manager import ConnectionManager

logger = logging.getLogger(__name__)


class WebSocketHandler:
    """Handles WebSocket events and routes them to appropriate handlers.

    Responsibilities:
    - WebSocket connection lifecycle management
    - Event parsing and routing
    - Event emission and broadcasting

    Delegates to:
    - SessionService: Session business logic
    - ClaudeRunner: Claude SDK execution
    """

    def __init__(self, store: SessionStore, manager: ConnectionManager):
        self.store = store
        self.service = SessionService(store)
        self.manager = manager
        self._runners: dict[str, ClaudeRunner] = {}
        self._pending_permissions: dict[str, dict[str, asyncio.Future]] = {}

    # =========================================================================
    # Connection Lifecycle
    # =========================================================================

    async def handle_connection(self, websocket: WebSocket) -> None:
        """Handle a WebSocket connection lifecycle."""
        await self.manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                await self._handle_message(websocket, data)
        except Exception as e:
            logger.debug(f"WebSocket connection closed: {e}")
        finally:
            await self.manager.disconnect(websocket)

    async def cleanup(self) -> None:
        """Clean up all runners."""
        for runner in self._runners.values():
            runner.abort()
        self._runners.clear()
        self._pending_permissions.clear()

    # =========================================================================
    # Message Routing
    # =========================================================================

    async def _handle_message(self, websocket: WebSocket, data: str) -> None:
        """Parse and route a client message."""
        try:
            raw = json.loads(data)
            event_type = raw.get("type")
            payload = raw.get("payload")
            logger.info(f"Received event: {event_type}, payload keys: {list(payload.keys()) if payload else None}")

            handlers = {
                "session.list": lambda: self._handle_session_list(),
                "session.history": lambda: self._handle_session_history(
                    SessionHistoryPayload(**payload)
                ),
                "session.start": lambda: self._handle_session_start(
                    SessionStartPayload(**payload)
                ),
                "session.continue": lambda: self._handle_session_continue(
                    SessionContinuePayload(**payload)
                ),
                "session.stop": lambda: self._handle_session_stop(
                    SessionStopPayload(**payload)
                ),
                "session.delete": lambda: self._handle_session_delete(
                    SessionDeletePayload(**payload)
                ),
                "permission.response": lambda: self._handle_permission_response(
                    PermissionResponsePayload(**payload)
                ),
            }

            handler = handlers.get(event_type)
            if handler:
                await handler()
            else:
                logger.warning(f"Unknown event type: {event_type}")

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON: {e}")
        except Exception as e:
            logger.exception(f"Error handling message: {e}")

    # =========================================================================
    # Event Emission Helpers (DRY principle)
    # =========================================================================

    async def _emit(self, event: ServerEvent) -> None:
        """Emit a server event, with checks for deleted sessions."""
        payload_info = ""
        if hasattr(event.payload, 'session_id'):
            payload_info = f", session={event.payload.session_id[:8]}"
        if hasattr(event.payload, 'status'):
            payload_info += f", status={event.payload.status}"
        logger.info(f"Emitting event: type={event.type}{payload_info}")
        # Skip events for deleted sessions
        if event.type in (
            "session.status",
            "stream.message",
            "stream.user_prompt",
            "permission.request",
        ):
            payload = event.payload
            if hasattr(payload, "session_id") and not self._has_live_session(
                payload.session_id
            ):
                logger.warning(f"Skipping event for deleted session: {payload.session_id}")
                return

        # Record side effects
        await self._record_event_side_effects(event)
        logger.info(f"Broadcasting event to {self.manager.connection_count} connections")
        await self.manager.broadcast(event)

    async def _record_event_side_effects(self, event: ServerEvent) -> None:
        """Record side effects for events (messages, status updates)."""
        if event.type == "session.status" and isinstance(
            event.payload, SessionStatusPayload
        ):
            await self.store.update_session(
                event.payload.session_id, {"status": event.payload.status}
            )
        elif event.type == "stream.message" and isinstance(
            event.payload, StreamMessagePayload
        ):
            await self.store.record_message(
                event.payload.session_id, event.payload.message
            )
        elif event.type == "stream.user_prompt" and isinstance(
            event.payload, StreamUserPromptPayload
        ):
            await self.store.record_message(
                event.payload.session_id,
                {"type": "user_prompt", "prompt": event.payload.prompt},
            )

    def _has_live_session(self, session_id: str) -> bool:
        """Check if a session exists in memory."""
        return self.service.get_session(session_id) is not None

    async def _emit_session_status(
        self,
        session: Session,
        status: SessionStatus,
        error: str | None = None,
    ) -> None:
        """Helper to emit session status event (DRY)."""
        await self._emit(
            ServerEvent(
                type="session.status",
                payload=SessionStatusPayload(
                    session_id=session.id,
                    status=status,
                    title=session.title,
                    cwd=session.cwd,
                    error=error,
                ),
            )
        )

    async def _emit_user_prompt(self, session_id: str, prompt: str) -> None:
        """Helper to emit user prompt event (DRY)."""
        await self._emit(
            ServerEvent(
                type="stream.user_prompt",
                payload=StreamUserPromptPayload(session_id=session_id, prompt=prompt),
            )
        )

    async def _emit_session_deleted(self, session_id: str) -> None:
        """Helper to emit session deleted event (DRY)."""
        await self._emit(
            ServerEvent(
                type="session.deleted",
                payload=SessionDeletedPayload(session_id=session_id),
            )
        )

    async def _emit_runner_error(self, session_id: str, message: str) -> None:
        """Helper to emit runner error event (DRY)."""
        await self._emit(
            ServerEvent(
                type="runner.error",
                payload=RunnerErrorPayload(session_id=session_id, message=message),
            )
        )

    # =========================================================================
    # Event Handlers
    # =========================================================================

    async def _handle_session_list(self) -> None:
        """Handle session.list event."""
        sessions = await self.service.list_sessions()
        await self._emit(
            ServerEvent(
                type="session.list",
                payload=SessionListPayload(
                    sessions=[
                        {
                            "id": s.id,
                            "title": s.title,
                            "status": s.status,
                            "claudeSessionId": s.claude_session_id,
                            "cwd": s.cwd,
                            "createdAt": s.created_at,
                            "updatedAt": s.updated_at,
                        }
                        for s in sessions
                    ]
                ),
            )
        )

    async def _handle_session_history(self, payload: SessionHistoryPayload) -> None:
        """Handle session.history event."""
        result = await self.service.get_session_history(payload.session_id)

        if not result:
            await self._emit_session_deleted(payload.session_id)
            return

        session, messages = result
        await self._emit(
            ServerEvent(
                type="session.history",
                payload=SessionHistoryResponsePayload(
                    session_id=session.id,
                    status=session.status,
                    messages=messages,
                ),
            )
        )

    async def _handle_session_start(self, payload: SessionStartPayload) -> None:
        """Handle session.start event."""
        logger.info(f"Starting session: title={payload.title}, cwd={payload.cwd}")
        session = await self.service.create_and_start_session(
            title=payload.title,
            prompt=payload.prompt,
            cwd=payload.cwd,
            allowed_tools=payload.allowed_tools,
        )
        logger.info(f"Session created: id={session.id}")

        await self._emit_session_status(session, SessionStatus.RUNNING)
        await self._emit_user_prompt(session.id, payload.prompt)
        logger.info(f"Starting runner for session {session.id}")
        await self._start_runner(session, payload.prompt, session.claude_session_id)

    async def _handle_session_continue(self, payload: SessionContinuePayload) -> None:
        """Handle session.continue event."""
        session, error = await self.service.continue_session(
            payload.session_id, payload.prompt
        )

        if error:
            if session is None:
                await self._emit_session_deleted(payload.session_id)
            await self._emit_runner_error(payload.session_id, error)
            return

        await self._emit_session_status(session, SessionStatus.RUNNING)
        await self._emit_user_prompt(session.id, payload.prompt)
        await self._start_runner(session, payload.prompt, session.claude_session_id)

    async def _handle_session_stop(self, payload: SessionStopPayload) -> None:
        """Handle session.stop event."""
        # Stop the runner first
        runner = self._runners.pop(payload.session_id, None)
        if runner:
            runner.abort()

        session = await self.service.stop_session(payload.session_id)
        if session:
            await self._emit_session_status(session, SessionStatus.IDLE)

    async def _handle_session_delete(self, payload: SessionDeletePayload) -> None:
        """Handle session.delete event."""
        # Stop the runner first
        runner = self._runners.pop(payload.session_id, None)
        if runner:
            runner.abort()

        await self.service.delete_session(payload.session_id)
        await self._emit_session_deleted(payload.session_id)

    async def _handle_permission_response(
        self, payload: PermissionResponsePayload
    ) -> None:
        """Handle permission.response event."""
        session = self.service.get_session(payload.session_id)
        if not session:
            return

        runner = self._runners.get(session.id)
        if runner:
            runner.resolve_permission(payload.tool_use_id, payload.result)

    # =========================================================================
    # Runner Management
    # =========================================================================

    async def _start_runner(
        self, session: Session, prompt: str, resume_session_id: str | None
    ) -> None:
        """Start a Claude runner for a session."""
        logger.info(f"Creating runner for session {session.id}, cwd={session.cwd}")
        runner = ClaudeRunner(
            session=session,
            prompt=prompt,
            resume_session_id=resume_session_id,
            on_message=self._create_message_handler(session.id),
            on_status=self._create_status_handler(session),
            on_session_update=self._create_session_update_handler(session.id),
            on_permission_request=self._create_permission_handler(session.id),
        )

        self._runners[session.id] = runner
        logger.info(f"Runner created, starting execution...")

        try:
            await runner.run()
            logger.info(f"Runner.run() completed for session {session.id}")
        except Exception as e:
            logger.exception(f"Error starting runner for session {session.id}")
            await self.service.mark_session_error(session.id, str(e))
            await self._emit_session_status(session, SessionStatus.ERROR, str(e))

    def _create_message_handler(
        self, session_id: str
    ) -> Any:  # Callable[[dict], Awaitable[None]]
        """Create a message handler for a runner (Factory pattern)."""

        async def on_message(message: dict[str, Any]) -> None:
            await self._emit(
                ServerEvent(
                    type="stream.message",
                    payload=StreamMessagePayload(
                        session_id=session_id, message=message
                    ),
                )
            )

        return on_message

    def _create_status_handler(
        self, session: Session
    ) -> Any:  # Callable[[SessionStatus, str | None], Awaitable[None]]
        """Create a status handler for a runner (Factory pattern)."""

        async def on_status(status: SessionStatus, error: str | None) -> None:
            await self._emit_session_status(session, status, error)

        return on_status

    def _create_session_update_handler(
        self, session_id: str
    ) -> Any:  # Callable[[dict], Awaitable[None]]
        """Create a session update handler for a runner (Factory pattern)."""

        async def on_session_update(updates: dict[str, Any]) -> None:
            await self.store.update_session(session_id, updates)

        return on_session_update

    def _create_permission_handler(
        self, session_id: str
    ) -> Any:  # Callable[[str, str, Any], Awaitable[dict]]
        """Create a permission request handler for a runner (Factory pattern)."""

        async def on_permission_request(
            tool_use_id: str, tool_name: str, tool_input: Any
        ) -> dict[str, Any]:
            await self._emit(
                ServerEvent(
                    type="permission.request",
                    payload=PermissionRequestPayload(
                        session_id=session_id,
                        tool_use_id=tool_use_id,
                        tool_name=tool_name,
                        input=tool_input,
                    ),
                )
            )

            if session_id not in self._pending_permissions:
                self._pending_permissions[session_id] = {}

            future: asyncio.Future[dict[str, Any]] = asyncio.Future()
            self._pending_permissions[session_id][tool_use_id] = future

            try:
                return await future
            finally:
                self._pending_permissions.get(session_id, {}).pop(tool_use_id, None)

        return on_permission_request
