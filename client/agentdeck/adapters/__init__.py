from .base import AgentAdapter
from .claude import ClaudeCodeAdapter
from .codex import CodexAdapter
from .mock import MockAdapter


def create_adapter(name: str) -> AgentAdapter:
    adapters = {"codex": CodexAdapter, "claude": ClaudeCodeAdapter, "mock": MockAdapter}
    try:
        return adapters[name]()
    except KeyError:
        raise ValueError(f"Unsupported agent: {name}") from None


__all__ = ["AgentAdapter", "ClaudeCodeAdapter", "CodexAdapter", "MockAdapter", "create_adapter"]
