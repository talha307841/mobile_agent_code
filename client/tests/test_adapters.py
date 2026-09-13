import pytest
from agentdeck.adapters import MockAdapter, create_adapter
from agentdeck.adapters.codex import _event_text


@pytest.mark.asyncio
async def test_mock_adapter_streams(tmp_path):
    events = [event async for event in MockAdapter().run("hello", tmp_path)]
    assert events


def test_adapter_factory():
    assert create_adapter("mock").name == "mock"
    with pytest.raises(ValueError):
        create_adapter("unknown")


def test_codex_event_text_avoids_duplicate_command_lines():
    started = {
        "type": "item.started",
        "item": {"type": "command_execution", "command": "pytest"},
    }
    completed = {
        "type": "item.completed",
        "item": {"type": "command_execution", "command": "pytest", "aggregated_output": "ok"},
    }
    assert _event_text(started) == "pytest"
    assert _event_text(completed) == "ok"
    assert _event_text({"type": "turn.started"}) == ""
