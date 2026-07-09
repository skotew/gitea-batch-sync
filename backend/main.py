from __future__ import annotations

import logging
from pathlib import Path
from time import perf_counter

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .gitea_client import GiteaClient
from .git_ops import enrich_repository, inspect_branch_status, sync_repository
from .models import BranchStatusRequest, BranchStatusResponse, DiscoverRequest, DiscoverResponse, SyncRequest, SyncResponse


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Gitea Batch Sync")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    logger.debug("health check")
    return {"status": "ok"}


@app.post("/api/repositories/discover")
def discover_repositories(payload: DiscoverRequest) -> DiscoverResponse:
    started = perf_counter()
    config = _hydrate_git_username(payload.config)
    target = Path(config.target_path).expanduser()
    logger.info(
        "discover request started base_url=%s target=%s protocol=%s auth=%s directory_mode=%s",
        config.base_url,
        target,
        config.clone_protocol,
        config.auth_type,
        config.directory_mode,
    )
    if not config.base_url.startswith(("http://", "https://")):
        logger.warning("discover rejected: invalid base_url=%s", config.base_url)
        raise HTTPException(status_code=400, detail="Gitea URL 必须以 http:// 或 https:// 开头")
    if not target.exists():
        logger.info("creating target directory target=%s", target)
        target.mkdir(parents=True, exist_ok=True)
    if not target.is_dir():
        logger.warning("discover rejected: target is not a directory target=%s", target)
        raise HTTPException(status_code=400, detail="本地目标路径不是目录")

    try:
        raw_repos = GiteaClient(config).list_accessible_repositories()
    except requests.HTTPError as exc:
        detail = exc.response.text[:500] if exc.response is not None else str(exc)
        logger.exception("gitea api request failed status=%s", exc.response.status_code if exc.response is not None else "unknown")
        raise HTTPException(status_code=502, detail=f"Gitea API 请求失败：{detail}") from exc
    except requests.RequestException as exc:
        logger.exception("gitea connection failed")
        raise HTTPException(status_code=502, detail=f"无法连接 Gitea：{exc}") from exc

    repos = [enrich_repository(repo, config) for repo in raw_repos]
    repos.sort(key=lambda item: (item.local_status, item.full_name.lower()))
    logger.info(
        "discover request completed repos=%s elapsed_ms=%s",
        len(repos),
        round((perf_counter() - started) * 1000),
    )
    return DiscoverResponse(repositories=repos, target_path=str(target))


@app.post("/api/repositories/sync")
def sync_repositories(payload: SyncRequest) -> SyncResponse:
    started = perf_counter()
    config = _hydrate_git_username(payload.config)
    logger.info("sync request started repositories=%s target=%s protocol=%s", len(payload.repositories), config.target_path, config.clone_protocol)
    results = [sync_repository(repo, config) for repo in payload.repositories]
    success_count = sum(1 for result in results if result.success)
    logger.info(
        "sync request completed repositories=%s success=%s failed=%s elapsed_ms=%s",
        len(results),
        success_count,
        len(results) - success_count,
        round((perf_counter() - started) * 1000),
    )
    return SyncResponse(results=results)


@app.post("/api/repositories/branch-status")
def branch_status(payload: BranchStatusRequest) -> BranchStatusResponse:
    started = perf_counter()
    config = _hydrate_git_username(payload.config)
    logger.info(
        "branch status request started full_name=%s branch=%s",
        payload.repository.full_name,
        payload.repository.selected_branch_ref,
    )
    branch = inspect_branch_status(payload.repository, config)
    logger.info(
        "branch status request completed full_name=%s branch=%s status=%s elapsed_ms=%s",
        payload.repository.full_name,
        branch.ref,
        branch.sync_status,
        round((perf_counter() - started) * 1000),
    )
    return BranchStatusResponse(branch=branch)


def _hydrate_git_username(config):
    if config.clone_protocol == "http" and config.auth_type == "token" and config.token and not config.username:
        try:
            logger.info("resolving username from gitea api for http token clone")
            username = GiteaClient(config).current_username()
            if username:
                logger.info("resolved username from gitea api username=%s", username)
                return config.model_copy(update={"username": username})
        except requests.RequestException:
            logger.exception("failed to resolve username from gitea api")
            return config
    return config
