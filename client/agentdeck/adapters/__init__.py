from .base import AgentAdapter
from .claude import ClaudeCodeAdapter
from .codex import CodexAdapter
from .mock import MockAdapter


def create_adapter(name: str) -> AgentAdapter:
    if name == "codex":
        return CodexAdapter()
    if name == "claude":
        return ClaudeCodeAdapter()
    if name == "mock":
        return MockAdapter()
    raise ValueError(f"Unsupported agent: {name}")


__all__ = ["AgentAdapter", "ClaudeCodeAdapter", "CodexAdapter", "MockAdapter", "create_adapter"]
