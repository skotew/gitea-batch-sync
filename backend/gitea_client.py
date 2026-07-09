from __future__ import annotations

import logging
from urllib.parse import urljoin

import requests

from .models import GiteaConfig


logger = logging.getLogger(__name__)


class GiteaClient:
    def __init__(self, config: GiteaConfig):
        self.config = config
        self.base_url = config.base_url.rstrip("/") + "/"
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})
        if config.auth_type == "token" and config.token.strip():
            self.session.headers.update({"Authorization": f"token {config.token.strip()}"})
        elif config.auth_type == "basic" and config.username:
            self.session.auth = (config.username, config.password)

    def list_accessible_repositories(self) -> list[dict]:
        logger.info("listing accessible repositories path=api/v1/user/repos")
        repos = self._paged_get("api/v1/user/repos")
        pullable = [repo for repo in repos if self._can_pull(repo)]
        result = self._dedupe_repos(pullable)
        logger.info("repository list loaded total=%s pullable=%s deduped=%s", len(repos), len(pullable), len(result))
        return result

    def current_username(self) -> str:
        logger.info("loading current gitea user")
        response = self.session.get(urljoin(self.base_url, "api/v1/user"), timeout=30)
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, dict):
            return str(payload.get("login") or payload.get("username") or payload.get("name") or "")
        return ""

    def _paged_get(self, path: str) -> list[dict]:
        page = 1
        items: list[dict] = []
        while True:
            logger.debug("gitea paged request path=%s page=%s limit=50", path, page)
            response = self.session.get(
                urljoin(self.base_url, path),
                params={"page": page, "limit": 50},
                timeout=30,
            )
            if response.status_code == 404 and path.endswith("/orgs"):
                logger.info("gitea path not found path=%s", path)
                return []
            response.raise_for_status()
            chunk = response.json()
            if not isinstance(chunk, list):
                logger.warning("gitea response is not a list path=%s page=%s", path, page)
                return items
            items.extend(chunk)
            logger.info("gitea page loaded path=%s page=%s count=%s total=%s", path, page, len(chunk), len(items))
            if len(chunk) < 50:
                return items
            page += 1

    @staticmethod
    def _dedupe_repos(repos: list[dict]) -> list[dict]:
        seen = set()
        result = []
        for repo in repos:
            full_name = repo.get("full_name") or repo.get("name")
            if not full_name or full_name in seen:
                continue
            seen.add(full_name)
            result.append(repo)
        return result

    @staticmethod
    def _can_pull(repo: dict) -> bool:
        permissions = repo.get("permissions")
        if not isinstance(permissions, dict):
            return True
        return permissions.get("pull") is not False
