from uuid import uuid4

import pytest
from agentdeck.config import ClientConfig, RepoConfig, resolve_allowed_repo


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
