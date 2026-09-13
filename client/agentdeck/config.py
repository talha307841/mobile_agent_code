from __future__ import annotations

import os
import stat
from pathlib import Path
from uuid import UUID, uuid4

from platformdirs import user_config_dir
from pydantic import BaseModel, Field


class RepoConfig(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    path: str


class ClientConfig(BaseModel):
    server_url: str = "http://localhost:8000"
    device_id: UUID | None = None
    device_name: str = "My laptop"
    label: str = "Personal"
    default_agent: str = "codex"
    repositories: list[RepoConfig] = Field(default_factory=list)


def config_dir() -> Path:
    override = os.environ.get("AGENTDECK_CONFIG_DIR")
    return Path(override) if override else Path(user_config_dir("agentdeck"))


def config_path() -> Path:
    return config_dir() / "config.json"


def credential_path() -> Path:
    return config_dir() / "credential"


def load_config() -> ClientConfig:
    path = config_path()
    return ClientConfig.model_validate_json(path.read_text()) if path.exists() else ClientConfig()


def save_config(config: ClientConfig) -> None:
    directory = config_dir()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    config_path().write_text(config.model_dump_json(indent=2))
    config_path().chmod(stat.S_IRUSR | stat.S_IWUSR)


def save_credential(value: str) -> None:
    directory = config_dir()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    credential_path().write_text(value)
    credential_path().chmod(stat.S_IRUSR | stat.S_IWUSR)


def load_credential() -> str:
    if not credential_path().exists():
        raise RuntimeError("Device is not registered. Run: agentdeck login")
    return credential_path().read_text().strip()


def delete_credential() -> None:
    credential_path().unlink(missing_ok=True)


def resolve_allowed_repo(config: ClientConfig, repository_id: UUID, requested_path: str) -> Path:
    match = next((repo for repo in config.repositories if repo.id == repository_id), None)
    if match is None:
        raise PermissionError("Repository is not allowlisted")
    configured = Path(match.path).expanduser().resolve(strict=True)
    requested = Path(requested_path).expanduser().resolve(strict=True)
    if requested != configured or not configured.is_dir():
        raise PermissionError("Repository path does not match allowlist")
    return configured


def discover_git_repositories(root: Path) -> list[Path]:
    """Find Git working trees below an explicitly selected directory."""
    resolved_root = root.expanduser().resolve(strict=True)
    if not resolved_root.is_dir():
        raise ValueError("Discovery root must be a directory")
    found: list[Path] = []
    ignored = {"node_modules", ".venv", "venv", ".cache", "build", "dist"}
    for current, directories, _ in os.walk(resolved_root):
        if ".git" in directories:
            found.append(Path(current).resolve())
            directories.clear()
            continue
        directories[:] = [name for name in directories if name not in ignored and not name.startswith(".")]
    return sorted(found)
