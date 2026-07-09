from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from os import environ
from shlex import quote

from .models import BranchOption, GiteaConfig, RepoInfo, SyncItemResult


logger = logging.getLogger(__name__)


def enrich_repository(repo: dict, config: GiteaConfig) -> RepoInfo:
    owner = _owner_name(repo)
    name = str(repo.get("name") or "")
    full_name = str(repo.get("full_name") or f"{owner}/{name}")
    clone_url = str(repo.get("clone_url") or "")
    ssh_url = str(repo.get("ssh_url") or "")
    selected_url = ssh_url if config.clone_protocol == "ssh" and ssh_url else clone_url
    local_dir_name = _local_dir_name(owner, name, config.directory_mode)
    local_path = Path(config.target_path).expanduser() / local_dir_name
    default_branch = str(repo.get("default_branch") or "")
    status, origin, note = inspect_local_repo(local_path, selected_url, default_branch, config)
    action = "clone" if status == "missing" else "pull" if status in {"update_available", "up_to_date", "local_ahead", "diverged"} else "skip"
    branches = _branch_options(local_path, selected_url, default_branch, config)
    current_branch = _current_branch(local_path) if (local_path / ".git").exists() else ""
    selected_branch_ref = _default_selected_branch(branches, current_branch, default_branch)
    logger.info("repository inspected full_name=%s status=%s action=%s local_path=%s note=%s", full_name, status, action, local_path, note)
    return RepoInfo(
        id=repo.get("id"),
        name=name,
        full_name=full_name,
        owner=owner,
        private=bool(repo.get("private")),
        html_url=str(repo.get("html_url") or repo.get("website") or ""),
        clone_url=clone_url,
        ssh_url=ssh_url,
        selected_url=selected_url,
        local_dir_name=local_dir_name,
        local_path=str(local_path),
        local_status=status,
        action=action,
        origin_url=origin,
        note=note,
        default_branch=default_branch,
        current_branch=current_branch,
        selected_branch_ref=selected_branch_ref,
        branches=branches,
    )


def inspect_local_repo(local_path: Path, selected_url: str, default_branch: str, config: GiteaConfig) -> tuple[str, str, str]:
    if not local_path.exists():
        logger.debug("local repository missing path=%s", local_path)
        return "missing", "", ""
    if not (local_path / ".git").exists():
        logger.warning("target exists but is not git repository path=%s", local_path)
        return "conflict", "", "目标目录已存在，但不是 Git 仓库"
    origin = _run_git(["remote", "get-url", "origin"], local_path).stdout.strip()
    if selected_url and origin and _normalize_remote(origin) != _normalize_remote(selected_url):
        logger.warning("origin mismatch path=%s origin=%s selected_url=%s", local_path, _safe_remote_url(origin), _safe_remote_url(selected_url))
        return "conflict", origin, "本地 origin 与 Gitea 地址不一致"
    has_tracked_changes, has_untracked_files = _worktree_state(local_path)
    if has_tracked_changes:
        logger.info("tracked local changes found path=%s", local_path)
        return "local_changes", origin, "本地已跟踪文件存在未提交修改，请先 commit、stash 或还原后再同步"
    return _inspect_remote_state(local_path, default_branch, config, origin, has_untracked_files)


def _syncable_repository_status(local_path: Path, selected_url: str) -> tuple[str, str]:
    if not local_path.exists():
        return "missing", ""
    if not (local_path / ".git").exists():
        return "conflict", "目标目录已存在，但不是 Git 仓库"
    origin = _run_git(["remote", "get-url", "origin"], local_path).stdout.strip()
    if selected_url and origin and _normalize_remote(origin) != _normalize_remote(selected_url):
        return "conflict", "本地 origin 与 Gitea 地址不一致"
    has_tracked_changes, _ = _worktree_state(local_path)
    if has_tracked_changes:
        return "local_changes", "本地已跟踪文件存在未提交修改，已跳过"
    return "ready", ""


def sync_repository(repo: RepoInfo, config: GiteaConfig) -> SyncItemResult:
    local_path = Path(repo.local_path)
    logger.info(
        "sync repository requested full_name=%s requested_action=%s branch=%s path=%s",
        repo.full_name,
        repo.action,
        repo.selected_branch_ref,
        local_path,
    )
    checked_status, checked_note = _syncable_repository_status(local_path, repo.selected_url)
    checked_action = "clone" if checked_status == "missing" else "pull" if checked_status == "ready" else "skip"
    repo = repo.model_copy(update={"action": checked_action, "note": checked_note or repo.note})
    logger.info("sync repository checked full_name=%s status=%s action=%s", repo.full_name, repo.local_status, repo.action)
    cleanup_path = None
    try:
        if repo.action == "clone":
            env, cleanup_path = _git_env(config)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            clone_args = ["git", "clone"]
            target_branch = _branch_name_from_ref(repo.selected_branch_ref)
            if target_branch:
                clone_args.extend(["--branch", target_branch])
            clone_args.extend([repo.selected_url, str(local_path)])
            logger.info("git clone started full_name=%s branch=%s path=%s", repo.full_name, target_branch or "(default)", local_path)
            result = _run(clone_args, cwd=local_path.parent, env=env)
        elif repo.action == "pull":
            has_tracked_changes, _ = _worktree_state(local_path)
            if has_tracked_changes:
                logger.warning("sync skipped because tracked local changes appeared full_name=%s path=%s", repo.full_name, local_path)
                return SyncItemResult(
                    full_name=repo.full_name,
                    local_path=repo.local_path,
                    action="skip",
                    success=False,
                    message="本地已跟踪文件存在未提交修改，已跳过",
                )
            env, cleanup_path = _git_env(config)
            result = _sync_selected_branch(repo, local_path, env)
        else:
            logger.info("sync skipped full_name=%s status=%s note=%s", repo.full_name, repo.local_status, repo.note)
            return SyncItemResult(
                full_name=repo.full_name,
                local_path=repo.local_path,
                action=repo.action,
                success=False,
                message=repo.note or "已跳过",
            )
    finally:
        if cleanup_path:
            cleanup_path.unlink(missing_ok=True)
    success = result.returncode == 0
    message = _summarize_git_output(repo.action, result)
    logger.info("sync repository completed full_name=%s action=%s success=%s returncode=%s message=%s", repo.full_name, repo.action, success, result.returncode, message)
    return SyncItemResult(
        full_name=repo.full_name,
        local_path=repo.local_path,
        action=repo.action,
        success=success,
        message=message,
    )


def inspect_branch_status(repo: RepoInfo, config: GiteaConfig) -> BranchOption:
    local_path = Path(repo.local_path)
    kind, name = _parse_branch_ref(repo.selected_branch_ref)
    branch = _find_branch_option(repo, repo.selected_branch_ref)
    if branch is None:
        branch = BranchOption(name=name, ref=repo.selected_branch_ref, kind="local" if kind != "remote" else "remote")
    if kind == "remote":
        logger.info("branch status skipped for remote branch full_name=%s branch=%s", repo.full_name, name)
        return branch.model_copy(update={"sync_status": "", "note": ""})
    if not (local_path / ".git").exists():
        return branch.model_copy(update={"sync_status": "unknown", "note": "目标目录已存在，但不是 Git 仓库"})
    cleanup_path = None
    try:
        env, cleanup_path = _git_env(config)
        logger.info("branch status refresh started full_name=%s branch=%s", repo.full_name, name)
        fetch = _run_git(["fetch", "--quiet", "origin"], local_path, env=env, timeout=90)
        if fetch.returncode != 0:
            logger.warning("branch status fetch failed full_name=%s branch=%s returncode=%s stderr=%s", repo.full_name, name, fetch.returncode, fetch.stderr.strip()[-500:])
            return branch.model_copy(update={"sync_status": "unknown", "note": "无法获取远端状态，可尝试同步或检查凭证"})
        state = _local_branch_sync_state(local_path, name)
        logger.info("branch status refreshed full_name=%s branch=%s status=%s note=%s", repo.full_name, name, state.get("sync_status"), state.get("note"))
        return branch.model_copy(update=state)
    finally:
        if cleanup_path:
            cleanup_path.unlink(missing_ok=True)


def _owner_name(repo: dict) -> str:
    owner = repo.get("owner")
    if isinstance(owner, dict):
        return str(owner.get("login") or owner.get("username") or owner.get("name") or "")
    return str(repo.get("owner_name") or "")


def _local_dir_name(owner: str, name: str, mode: str) -> str:
    if mode == "owner_name" and owner:
        return str(Path(owner) / name)
    return name


def _branch_options(local_path: Path, selected_url: str, default_branch: str, config: GiteaConfig) -> list[BranchOption]:
    if (local_path / ".git").exists():
        return _local_repo_branch_options(local_path, default_branch)
    return _remote_branch_options(selected_url, default_branch, config)


def _local_repo_branch_options(local_path: Path, default_branch: str) -> list[BranchOption]:
    current = _current_branch(local_path)
    local_names = _git_lines(["for-each-ref", "--format=%(refname:short)", "refs/heads"], local_path)
    remote_names = [
        name
        for name in _git_lines(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], local_path)
        if name != "origin/HEAD"
    ]
    result = [
        BranchOption(
            name=name,
            ref=f"local:{name}",
            kind="local",
            is_current=name == current,
            is_default=name == default_branch,
            **(_local_branch_sync_state(local_path, name) if name == current else {}),
        )
        for name in local_names
    ]
    result.extend(
        BranchOption(
            name=name,
            ref=f"remote:{name}",
            kind="remote",
            is_current=False,
            is_default=name == f"origin/{default_branch}",
        )
        for name in remote_names
    )
    return result


def _remote_branch_options(selected_url: str, default_branch: str, config: GiteaConfig) -> list[BranchOption]:
    if not selected_url:
        return []
    cleanup_path = None
    try:
        env, cleanup_path = _git_env(config)
        result = _run(["git", "ls-remote", "--heads", selected_url], cwd=Path.cwd(), env=env, timeout=90)
        if result.returncode != 0:
            logger.warning("ls-remote failed selected_url=%s returncode=%s stderr=%s", _safe_remote_url(selected_url), result.returncode, result.stderr.strip()[-500:])
            return []
        branches = []
        for line in result.stdout.splitlines():
            if "refs/heads/" not in line:
                continue
            name = line.rsplit("refs/heads/", 1)[1].strip()
            branches.append(name)
        return [
            BranchOption(name=f"origin/{name}", ref=f"remote:origin/{name}", kind="remote", is_default=name == default_branch)
            for name in sorted(set(branches))
        ]
    finally:
        if cleanup_path:
            cleanup_path.unlink(missing_ok=True)


def _default_selected_branch(branches: list[BranchOption], current_branch: str, default_branch: str) -> str:
    if current_branch:
        ref = f"local:{current_branch}"
        if any(branch.ref == ref for branch in branches):
            return ref
    default_refs = [f"local:{default_branch}", f"remote:origin/{default_branch}"]
    for ref in default_refs:
        if any(branch.ref == ref for branch in branches):
            return ref
    return branches[0].ref if branches else ""


def _find_branch_option(repo: RepoInfo, branch_ref: str) -> BranchOption | None:
    return next((branch for branch in repo.branches if branch.ref == branch_ref), None)


def _git_lines(args: list[str], local_path: Path) -> list[str]:
    result = _run_git(args, local_path)
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _local_branch_sync_state(local_path: Path, branch: str) -> dict[str, str]:
    remote_ref = f"origin/{branch}"
    if _run_git(["rev-parse", "--verify", "--quiet", remote_ref], local_path).returncode != 0:
        return {"sync_status": "unknown", "note": f"找不到远端分支 {remote_ref}"}
    compare = _run_git(["rev-list", "--left-right", "--count", f"{branch}...{remote_ref}"], local_path)
    if compare.returncode != 0:
        return {"sync_status": "unknown", "note": "无法比较本地与远端提交"}
    ahead, behind = _parse_ahead_behind(compare.stdout)
    if ahead == 0 and behind == 0:
        return {"sync_status": "up_to_date", "note": "已是最新"}
    if ahead == 0 and behind > 0:
        return {"sync_status": "update_available", "note": f"远端领先 {behind} 个提交"}
    if ahead > 0 and behind == 0:
        return {"sync_status": "local_ahead", "note": f"本地领先 {ahead} 个提交"}
    return {"sync_status": "diverged", "note": f"本地领先 {ahead} 个提交，远端领先 {behind} 个提交"}


def _normalize_remote(value: str) -> str:
    return value.rstrip("/").removesuffix(".git")


def _safe_remote_url(value: str) -> str:
    if "@" not in value or "://" not in value:
        return value
    scheme, rest = value.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def _inspect_remote_state(
    local_path: Path,
    default_branch: str,
    config: GiteaConfig,
    origin: str,
    has_untracked_files: bool,
) -> tuple[str, str, str]:
    cleanup_path = None
    try:
        env, cleanup_path = _git_env(config)
        logger.debug("fetching remote state path=%s", local_path)
        fetch = _run_git(["fetch", "--quiet", "origin"], local_path, env=env, timeout=90)
        if fetch.returncode != 0:
            logger.warning("fetch failed path=%s returncode=%s stderr=%s", local_path, fetch.returncode, fetch.stderr.strip()[-500:])
            return "unknown", origin, "无法获取远端状态，可尝试同步或检查凭证"
        branch = _current_branch(local_path) or default_branch
        if not branch:
            return "unknown", origin, "无法识别当前分支"
        remote_ref = f"origin/{branch}"
        if _run_git(["rev-parse", "--verify", "--quiet", remote_ref], local_path).returncode != 0:
            if default_branch:
                remote_ref = f"origin/{default_branch}"
            if _run_git(["rev-parse", "--verify", "--quiet", remote_ref], local_path).returncode != 0:
                return "unknown", origin, "找不到对应的远端分支"
        compare = _run_git(["rev-list", "--left-right", "--count", f"HEAD...{remote_ref}"], local_path)
        if compare.returncode != 0:
            logger.warning("compare failed path=%s remote_ref=%s returncode=%s stderr=%s", local_path, remote_ref, compare.returncode, compare.stderr.strip()[-500:])
            return "unknown", origin, "无法比较本地与远端提交"
        ahead, behind = _parse_ahead_behind(compare.stdout)
        logger.info("remote state compared path=%s branch=%s ahead=%s behind=%s", local_path, branch, ahead, behind)
        if ahead == 0 and behind == 0:
            return "up_to_date", origin, _with_untracked_note("已是最新", has_untracked_files)
        if ahead == 0 and behind > 0:
            return "update_available", origin, _with_untracked_note(f"远端领先 {behind} 个提交", has_untracked_files)
        if ahead > 0 and behind == 0:
            return "local_ahead", origin, _with_untracked_note(f"本地领先 {ahead} 个提交", has_untracked_files)
        return "diverged", origin, _with_untracked_note(f"本地领先 {ahead} 个提交，远端领先 {behind} 个提交", has_untracked_files)
    finally:
        if cleanup_path:
            cleanup_path.unlink(missing_ok=True)


def _current_branch(local_path: Path) -> str:
    result = _run_git(["branch", "--show-current"], local_path)
    return result.stdout.strip() if result.returncode == 0 else ""


def _sync_selected_branch(repo: RepoInfo, local_path: Path, env: dict[str, str] | None) -> subprocess.CompletedProcess[str]:
    fetch = _run_git(["fetch", "--quiet", "origin"], local_path, env=env, timeout=90)
    if fetch.returncode != 0:
        logger.warning("sync fetch failed full_name=%s returncode=%s stderr=%s", repo.full_name, fetch.returncode, fetch.stderr.strip()[-500:])
        return fetch

    selected = repo.selected_branch_ref or f"local:{_current_branch(local_path)}"
    kind, name = _parse_branch_ref(selected)
    if not name:
        return _completed_error("未选择目标分支")

    local_name = _local_name_for_selected_branch(kind, name)
    remote_ref = f"origin/{local_name}"
    current = _current_branch(local_path)
    logger.info("sync branch resolved full_name=%s selected=%s current=%s local_name=%s remote_ref=%s", repo.full_name, selected, current, local_name, remote_ref)

    if _run_git(["rev-parse", "--verify", "--quiet", remote_ref], local_path).returncode != 0:
        return _completed_error(f"找不到远端分支 {remote_ref}")

    if current == local_name:
        logger.info("git pull current branch full_name=%s branch=%s", repo.full_name, local_name)
        return _run_git(["pull", "--ff-only", "origin", local_name], local_path, env=env)

    if _local_branch_exists(local_path, local_name):
        if not _can_fast_forward(local_path, local_name, remote_ref):
            return _completed_error(f"本地分支 {local_name} 领先或已分叉，不能自动更新")
        logger.info("fast-forward local branch ref full_name=%s branch=%s remote_ref=%s", repo.full_name, local_name, remote_ref)
        result = _run_git(["branch", "-f", local_name, remote_ref], local_path, env=env)
        if result.returncode == 0 and kind == "remote":
            upstream = _run_git(["branch", "--set-upstream-to", remote_ref, local_name], local_path, env=env)
            if upstream.returncode != 0:
                return upstream
            return _combine_git_results(result, upstream)
        return result

    logger.info("create local tracking branch full_name=%s branch=%s remote_ref=%s", repo.full_name, local_name, remote_ref)
    return _run_git(["branch", "--track", local_name, remote_ref], local_path, env=env)


def _parse_branch_ref(value: str) -> tuple[str, str]:
    if ":" not in value:
        return "local", value
    kind, name = value.split(":", 1)
    return kind, name


def _local_name_for_selected_branch(kind: str, name: str) -> str:
    if kind == "remote" and name.startswith("origin/"):
        return name.removeprefix("origin/")
    return name


def _branch_name_from_ref(value: str) -> str:
    kind, name = _parse_branch_ref(value)
    return _local_name_for_selected_branch(kind, name)


def _local_branch_exists(local_path: Path, branch: str) -> bool:
    return _run_git(["rev-parse", "--verify", "--quiet", branch], local_path).returncode == 0


def _can_fast_forward(local_path: Path, local_branch: str, remote_ref: str) -> bool:
    return _run_git(["merge-base", "--is-ancestor", local_branch, remote_ref], local_path).returncode == 0


def _completed_error(message: str) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr=message)


def _combine_git_results(*results: subprocess.CompletedProcess[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(
        args=[],
        returncode=next((result.returncode for result in results if result.returncode != 0), 0),
        stdout="\n".join(result.stdout.strip() for result in results if result.stdout.strip()),
        stderr="\n".join(result.stderr.strip() for result in results if result.stderr.strip()),
    )


def _worktree_state(local_path: Path) -> tuple[bool, bool]:
    result = _run_git(["status", "--porcelain=v1", "--untracked-files=all"], local_path)
    if result.returncode != 0:
        return False, False
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    has_untracked_files = any(line.startswith("??") for line in lines)
    has_tracked_changes = any(not line.startswith("??") for line in lines)
    logger.debug("worktree state path=%s tracked_changes=%s untracked_files=%s entries=%s", local_path, has_tracked_changes, has_untracked_files, len(lines))
    return has_tracked_changes, has_untracked_files


def _with_untracked_note(note: str, has_untracked_files: bool) -> str:
    if not has_untracked_files:
        return note
    return f"{note}；存在未跟踪文件，工具不会自动处理"


def _parse_ahead_behind(value: str) -> tuple[int, int]:
    parts = value.strip().split()
    if len(parts) < 2:
        return 0, 0
    return int(parts[0]), int(parts[1])


def _git_env(config: GiteaConfig) -> tuple[dict[str, str] | None, Path | None]:
    if config.clone_protocol == "ssh":
        if not config.ssh_key_path.strip():
            return None, None
        key_path = Path(config.ssh_key_path).expanduser()
        command = f"ssh -i {quote(str(key_path))} -o IdentitiesOnly=yes"
        return {**environ, "GIT_SSH_COMMAND": command}, None

    username = config.username.strip()
    password = config.token.strip() if config.auth_type == "token" else config.password
    if not username or not password:
        return None, None
    askpass = _write_askpass(username, password)
    return {**environ, "GIT_ASKPASS": str(askpass), "GIT_TERMINAL_PROMPT": "0"}, askpass


def _write_askpass(username: str, password: str) -> Path:
    handle = tempfile.NamedTemporaryFile("w", prefix="gitea-askpass-", delete=False)
    path = Path(handle.name)
    handle.write("#!/bin/sh\n")
    handle.write("case \"$1\" in\n")
    handle.write(f"*Username*) printf '%s\\n' {quote(username)} ;;\n")
    handle.write(f"*) printf '%s\\n' {quote(password)} ;;\n")
    handle.write("esac\n")
    handle.close()
    path.chmod(0o700)
    return path


def _summarize_git_output(action: str, result: subprocess.CompletedProcess[str]) -> str:
    if result.returncode == 0:
        if action == "clone":
            return "clone 完成"
        if action == "pull":
            output = _compact_git_output(result.stdout, result.stderr)
            return output or "pull 完成"
        return "完成"
    output = _compact_git_output(result.stdout, result.stderr)
    return output or "执行失败"


def _compact_git_output(stdout: str, stderr: str) -> str:
    noisy_prefixes = (
        "Updating files:",
        "Receiving objects:",
        "Resolving deltas:",
        "Checking out files:",
    )
    lines = []
    for line in f"{stdout}\n{stderr}".splitlines():
        text = line.strip()
        if not text or text.startswith(noisy_prefixes):
            continue
        lines.append(text)
    if not lines:
        return ""
    return "\n".join(lines[-8:])[-1200:]


def _run_git(args: list[str], cwd: Path, env: dict[str, str] | None = None, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return _run(["git", *args], cwd=cwd, env=env, timeout=timeout)


def _run(args: list[str], cwd: Path, env: dict[str, str] | None = None, timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout, check=False)
