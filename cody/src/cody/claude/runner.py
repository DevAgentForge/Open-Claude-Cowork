"""Claude SDK runner - port of runner.ts."""

import asyncio
import contextlib
import dataclasses
import logging
import os
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import is_dataclass
from typing import Any

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    PermissionResultAllow,
    PermissionResultDeny,
    ToolPermissionContext,
)

from ..sessions.models import Session, SessionStatus

logger = logging.getLogger(__name__)


class ClaudeRunner:
    """Manages Claude Code SDK execution for a session."""

    def __init__(
        self,
        session: Session,
        prompt: str,
        resume_session_id: str | None,
        on_message: Callable[[dict[str, Any]], Awaitable[None]],
        on_status: Callable[[SessionStatus, str | None], Awaitable[None]],
        on_session_update: Callable[[dict[str, Any]], Awaitable[None]],
        on_permission_request: Callable[[str, str, Any], Awaitable[dict[str, Any]]],
    ):
        self.session = session
        self.prompt = prompt
        self.resume_session_id = resume_session_id
        self.on_message = on_message
        self.on_status = on_status
        self.on_session_update = on_session_update
        self.on_permission_request = on_permission_request
        self._abort_event = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._pending_permissions: dict[str, asyncio.Future] = {}
        self._client: ClaudeSDKClient | None = None

    async def run(self) -> None:
        """Start the Claude query in the background."""
        self._task = asyncio.create_task(self._execute())

    async def _execute(self) -> None:
        """Execute the Claude query."""
        logger.info(f"Executing query for session {self.session.id}, prompt: {self.prompt[:50]}...")
        try:
            # Build environment with API config
            env = self._build_env()
            logger.info(f"Environment: ANTHROPIC_API_KEY={'set' if env.get('ANTHROPIC_API_KEY') else 'NOT SET'}")

            # Create SDK options
            options = ClaudeAgentOptions(
                cwd=self.session.cwd or os.getcwd(),
                resume=self.resume_session_id,
                permission_mode="bypassPermissions",
                include_partial_messages=True,
                env=env,
                can_use_tool=self._can_use_tool,
                max_buffer_size=100 * 1024 * 1024,  # 100MB to handle large responses
            )
            logger.info(f"SDK options created, cwd={options.cwd}")

            # Create and use SDK client
            self._client = ClaudeSDKClient(options=options)
            logger.info("SDK client created")

            logger.info("Entering SDK client context...")
            async with self._client:
                logger.info("SDK client context entered successfully")
                # Send the query
                logger.info(f"Sending query: {self.prompt[:50]}...")
                await self._client.query(self.prompt)
                logger.info("Query sent successfully, now receiving messages...")

                # Receive all messages using receive_response() which waits for completion
                message_count = 0
                async for message in self._client.receive_response():
                    message_count += 1
                    logger.info(f"Received message #{message_count}, type: {type(message).__name__}")
                    if self._abort_event.is_set():
                        logger.info("Abort event set, breaking message loop")
                        break

                    # Convert message to dict for serialization
                    try:
                        message_dict = self._message_to_dict(message)
                        logger.debug(f"Message dict keys: {message_dict.keys()}")
                    except Exception as e:
                        logger.exception(f"Error converting message to dict: {e}")
                        continue

                    # Extract session_id from init message
                    if (
                        message_dict.get("type") == "system"
                        and message_dict.get("subtype") == "init"
                    ):
                        sdk_session_id = message_dict.get("session_id")
                        if sdk_session_id:
                            self.session.claude_session_id = sdk_session_id
                            await self.on_session_update(
                                {"claude_session_id": sdk_session_id}
                            )

                    # Send message to frontend
                    logger.info(f"Sending message to frontend: type={message_dict.get('type')}")
                    await self.on_message(message_dict)

                    # Handle result message
                    if message_dict.get("type") == "result":
                        status = (
                            SessionStatus.COMPLETED
                            if message_dict.get("subtype") == "success"
                            else SessionStatus.ERROR
                        )
                        logger.info(f"Result message received, sending status={status}")
                        await self.on_status(status, None)

                logger.info(f"Message loop completed, received {message_count} messages")

            # Query completed normally
            logger.info(f"Checking final status: session.status={self.session.status}, abort_event={self._abort_event.is_set()}")
            if (
                self.session.status == SessionStatus.RUNNING
                and not self._abort_event.is_set()
            ):
                logger.info("Sending final COMPLETED status")
                await self.on_status(SessionStatus.COMPLETED, None)
            else:
                logger.info("Skipping final COMPLETED status (already sent or aborted)")

        except asyncio.CancelledError:
            # Task was cancelled (abort)
            pass
        except Exception as e:
            if self._abort_event.is_set():
                return
            logger.exception("Error running Claude query")
            await self.on_status(SessionStatus.ERROR, str(e))
        finally:
            self._client = None

    def _build_env(self) -> dict[str, str]:
        """Build environment variables for the SDK."""
        env: dict[str, str] = {}

        # Add API configuration from environment
        if api_key := os.getenv("ANTHROPIC_API_KEY"):
            env["ANTHROPIC_API_KEY"] = api_key
            env["ANTHROPIC_AUTH_TOKEN"] = api_key
        if base_url := os.getenv("ANTHROPIC_BASE_URL"):
            env["ANTHROPIC_BASE_URL"] = base_url
        if model := os.getenv("ANTHROPIC_MODEL"):
            env["ANTHROPIC_MODEL"] = model

        return env

    def _message_to_dict(self, message: Any) -> dict[str, Any]:
        """Convert SDK message to dictionary, matching TypeScript SDK format.

        TypeScript SDK expects messages like:
        - AssistantMessage: { type: "assistant", message: { content: [...] } }
        - ResultMessage: { type: "result", subtype: "success", ... }
        - SystemMessage: { type: "system", subtype: "init", ... }
        - UserMessage: { type: "user", message: { content: [...] } }
        """
        raw = self._to_serializable(message)
        class_name = type(message).__name__

        # Wrap messages to match TypeScript SDK format
        if class_name == "AssistantMessage":
            return {
                "type": "assistant",
                "message": {
                    "content": raw.get("content", []),
                    "model": raw.get("model"),
                }
            }
        elif class_name == "UserMessage":
            return {
                "type": "user",
                "message": {
                    "content": raw.get("content", []),
                }
            }
        elif class_name == "ResultMessage":
            return {
                "type": "result",
                **raw,  # Include all fields like subtype, duration_ms, etc.
            }
        elif class_name == "SystemMessage":
            # System messages have subtype and data fields
            return {
                "type": "system",
                "subtype": raw.get("subtype"),
                **raw.get("data", {}),  # Flatten data fields for system messages
            }
        elif class_name == "StreamEvent":
            # Stream events are used for partial message streaming
            return {
                "type": "stream_event",
                **raw,
            }
        else:
            # Unknown message type - return as-is with type field
            return {"type": class_name.lower(), **raw}

    def _to_serializable(self, obj: Any) -> Any:
        """Recursively convert an object to JSON-serializable format.

        Handles dataclasses (used by Claude SDK), Pydantic models, and nested structures.
        Adds 'type' field to content blocks to match TypeScript SDK format.
        """
        # Handle None
        if obj is None:
            return None

        # Handle primitive types
        if isinstance(obj, (str, int, float, bool)):
            return obj

        # Handle dataclasses (Claude SDK uses dataclasses)
        if is_dataclass(obj) and not isinstance(obj, type):
            result = {
                k: self._to_serializable(v)
                for k, v in dataclasses.asdict(obj).items()
            }
            # Add type field to content blocks
            class_name = type(obj).__name__
            content_type_mapping = {
                "TextBlock": "text",
                "ToolUseBlock": "tool_use",
                "ToolResultBlock": "tool_result",
                "ThinkingBlock": "thinking",
            }
            if class_name in content_type_mapping:
                result["type"] = content_type_mapping[class_name]
            return result

        # Handle Pydantic models (have model_dump)
        if hasattr(obj, "model_dump"):
            return obj.model_dump()

        # Handle dictionaries
        if isinstance(obj, dict):
            return {k: self._to_serializable(v) for k, v in obj.items()}

        # Handle lists/tuples
        if isinstance(obj, (list, tuple)):
            return [self._to_serializable(item) for item in obj]

        # Handle objects with __dict__ (fallback for other SDK objects)
        if hasattr(obj, "__dict__"):
            result = {}
            for key, value in obj.__dict__.items():
                if not key.startswith("_"):
                    result[key] = self._to_serializable(value)
            # Also check for 'type' attribute which is common in SDK objects
            if hasattr(obj, "type") and "type" not in result:
                result["type"] = obj.type
            return result

        # Fallback: convert to string
        return str(obj)

    async def _can_use_tool(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        context: ToolPermissionContext,
    ) -> PermissionResultAllow | PermissionResultDeny:
        """Handle tool permission request - called by SDK.

        For AskUserQuestion, we need to wait for user response.
        For other tools, auto-approve.
        """
        if tool_name == "AskUserQuestion":
            tool_use_id = str(uuid.uuid4())

            # Request permission from user via callback
            result = await self.on_permission_request(
                tool_use_id, tool_name, tool_input
            )

            if result.get("behavior") == "allow":
                return PermissionResultAllow(
                    updated_input=result.get("updatedInput", tool_input)
                )
            return PermissionResultDeny(
                message=result.get("message", "User denied the request")
            )

        # Auto-approve other tools
        return PermissionResultAllow(updated_input=tool_input)

    async def can_use_tool(self, tool_name: str, tool_input: Any) -> dict[str, Any]:
        """Handle tool permission request - external interface.

        For AskUserQuestion, we need to wait for user response.
        For other tools, auto-approve.
        """
        if tool_name == "AskUserQuestion":
            tool_use_id = str(uuid.uuid4())

            # Create a future for the response
            future: asyncio.Future[dict[str, Any]] = asyncio.Future()
            self._pending_permissions[tool_use_id] = future

            # Request permission from user
            result = await self.on_permission_request(
                tool_use_id, tool_name, tool_input
            )

            return result

        # Auto-approve other tools
        return {"behavior": "allow", "updatedInput": tool_input}

    def resolve_permission(self, tool_use_id: str, result: dict[str, Any]) -> None:
        """Resolve a pending permission request."""
        future = self._pending_permissions.pop(tool_use_id, None)
        if future and not future.done():
            future.set_result(result)

    def abort(self) -> None:
        """Abort the running query."""
        self._abort_event.set()

        # Interrupt the client if it exists (fire and forget)
        if self._client:
            self._interrupt_task = asyncio.create_task(self._safe_interrupt())

        if self._task and not self._task.done():
            self._task.cancel()

        # Cancel all pending permissions
        for future in self._pending_permissions.values():
            if not future.done():
                future.set_result({"behavior": "deny", "message": "Session aborted"})
        self._pending_permissions.clear()

    async def _safe_interrupt(self) -> None:
        """Safely interrupt the client, ignoring any errors."""
        if self._client:
            with contextlib.suppress(Exception):
                await self._client.interrupt()
