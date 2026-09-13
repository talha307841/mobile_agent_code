from uuid import uuid4

import pytest
from agentdeck.config import (
    ClientConfig,
    RepoConfig,
    discover_git_repositories,
    resolve_allowed_repo,
)


def test_repo_allowlist_accepts_exact_path(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    item = RepoConfig(name="repo", path=str(repo))
    assert (
        resolve_allowed_repo(ClientConfig(repositories=[item]), item.id, str(repo))
        == repo.resolve()
    )


def test_repo_allowlist_rejects_unknown_and_traversal(tmp_path):
    repo = tmp_path / "repo"
    other = tmp_path / "other"
    repo.mkdir()
    other.mkdir()
    item = RepoConfig(name="repo", path=str(repo))
    config = ClientConfig(repositories=[item])
    with pytest.raises(PermissionError):
        resolve_allowed_repo(config, uuid4(), str(repo))
    with pytest.raises(PermissionError):
        resolve_allowed_repo(config, item.id, str(other))


def test_repository_discovery_finds_git_roots_and_skips_nested_content(tmp_path):
    first = tmp_path / "group" / "first"
    second = tmp_path / "second"
    (first / ".git").mkdir(parents=True)
    (first / "nested" / ".git").mkdir(parents=True)
    (second / ".git").mkdir(parents=True)
    assert discover_git_repositories(tmp_path) == [first.resolve(), second.resolve()]
