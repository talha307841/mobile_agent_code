from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import typer

from .config import (
    RepoConfig,
    delete_credential,
    discover_git_repositories,
    load_config,
    save_config,
    save_credential,
)
from .daemon import Daemon

app = typer.Typer(help="AgentDeck laptop client")
repo_app = typer.Typer(help="Manage allowed repositories")
app.add_typer(repo_app, name="repo")


@app.command()
def login(
    server: str = typer.Option(..., prompt=True),
    email: str = typer.Option(..., prompt=True),
    password: str = typer.Option(..., prompt=True, hide_input=True),
    name: str = typer.Option(..., prompt="Device name"),
    label: str = typer.Option("Personal", help="Work or Personal"),
) -> None:
    config = load_config()
    previous_device_id = config.device_id
    with httpx.Client(base_url=server.rstrip("/"), timeout=20) as client:
        response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        response.raise_for_status()
        access = response.json()["access_token"]
        response = client.post(
            "/api/v1/devices",
            headers={"Authorization": f"Bearer {access}"},
            json={"name": name, "label": label, "default_agent": config.default_agent},
        )
        response.raise_for_status()
        registration = response.json()
    config.server_url, config.device_id, config.device_name, config.label = (
        server.rstrip("/"),
        UUID(registration["id"]),
        name,
        label,
    )
    if previous_device_id != config.device_id:
        config.repositories = [
            repository.model_copy(update={"id": uuid4()}) for repository in config.repositories
        ]
    save_config(config)
    save_credential(registration["credential"])
    typer.echo(f"Registered {name} ({config.device_id})")


@repo_app.command("add")
def repo_add(path: Path, name: str = typer.Option(...)) -> None:
    resolved = path.expanduser().resolve(strict=True)
    if not resolved.is_dir():
        raise typer.BadParameter("Path must be a directory")
    config = load_config()
    if any(Path(repo.path) == resolved or repo.name == name for repo in config.repositories):
        raise typer.BadParameter("Repository path or name already exists")
    repo = RepoConfig(name=name, path=str(resolved))
    config.repositories.append(repo)
    save_config(config)
    typer.echo(f"Added {name}: {resolved} ({repo.id})")


@repo_app.command("list")
def repo_list() -> None:
    for repo in load_config().repositories:
        typer.echo(f"{repo.id}  {repo.name}  {repo.path}")


@repo_app.command("remove")
def repo_remove(name: str) -> None:
    config = load_config()
    before = len(config.repositories)
    config.repositories = [repo for repo in config.repositories if repo.name != name]
    if len(config.repositories) == before:
        raise typer.BadParameter("Repository not found")
    save_config(config)


@repo_app.command("rekey")
def repo_rekey() -> None:
    """Issue fresh repository IDs after registering the laptop again."""
    config = load_config()
    config.repositories = [
        repository.model_copy(update={"id": uuid4()}) for repository in config.repositories
    ]
    save_config(config)
    typer.echo(f"Issued fresh IDs for {len(config.repositories)} repositories")


@repo_app.command("discover")
def repo_discover(root: Path, prefix: str = typer.Option("")) -> None:
    """Allowlist every Git repository below ROOT."""
    config = load_config()
    existing_paths = {Path(repo.path).resolve() for repo in config.repositories}
    existing_names = {repo.name for repo in config.repositories}
    added = 0
    for path in discover_git_repositories(root):
        if path in existing_paths:
            continue
        base_name = f"{prefix}{path.name}"
        name = base_name
        suffix = 2
        while name in existing_names:
            name = f"{base_name}-{suffix}"
            suffix += 1
        config.repositories.append(RepoConfig(name=name, path=str(path)))
        existing_paths.add(path)
        existing_names.add(name)
        added += 1
        typer.echo(f"Added {name}: {path}")
    save_config(config)
    typer.echo(f"Discovered {added} new repositories. Restart the daemon to sync them.")


@app.command()
def configure(name: str | None = None, default_agent: str | None = None) -> None:
    config = load_config()
    if name:
        config.device_name = name
    if default_agent:
        if default_agent not in {"codex", "claude"}:
            raise typer.BadParameter("Agent must be codex or claude")
        config.default_agent = default_agent
    save_config(config)


@app.command()
def daemon() -> None:
    asyncio.run(Daemon().run_forever())


@app.command()
def status() -> None:
    config = load_config()
    typer.echo(config.model_dump_json(indent=2, exclude={"repositories"}))
    typer.echo(f"Allowed repositories: {len(config.repositories)}")


@app.command()
def logout() -> None:
    delete_credential()
    typer.echo("Local device credential removed")


if __name__ == "__main__":
    app()
