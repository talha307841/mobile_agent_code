import pytest

from agentdeck.adapters import MockAdapter, create_adapter


@pytest.mark.asyncio
async def test_mock_adapter_streams(tmp_path):
    events = [event async for event in MockAdapter().run("hello", tmp_path)]
    assert events


def test_adapter_factory():
    assert create_adapter("mock").name == "mock"
    with pytest.raises(ValueError):
        create_adapter("unknown")

