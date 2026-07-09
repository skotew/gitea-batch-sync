from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AuthType = Literal["token", "basic"]
DirectoryMode = Literal["name", "owner_name"]
LocalStatus = Literal[
    "missing",
    "update_available",
    "up_to_date",
    "local_changes",
    "local_ahead",
    "diverged",
    "unknown",
    "conflict",
]
SyncAction = Literal["clone", "pull", "skip"]
CloneProtocol = Literal["http", "ssh"]
BranchKind = Literal["local", "remote"]


class GiteaConfig(BaseModel):
    base_url: str = Field(..., min_length=1)
    auth_type: AuthType = "basic"
    username: str = ""
    password: str = ""
    token: str = ""
    target_path: str = Field(..., min_length=1)
    directory_mode: DirectoryMode = "name"
    clone_protocol: CloneProtocol = "http"
    ssh_key_path: str = ""


class RepoInfo(BaseModel):
    id: int | None = None
    name: str
    full_name: str
    owner: str
    private: bool = False
    html_url: str = ""
    clone_url: str = ""
    ssh_url: str = ""
    selected_url: str = ""
    local_dir_name: str
    local_path: str
    local_status: LocalStatus
    action: SyncAction
    origin_url: str = ""
    note: str = ""
    default_branch: str = ""
    current_branch: str = ""
    selected_branch_ref: str = ""
    branches: list["BranchOption"] = Field(default_factory=list)


class BranchOption(BaseModel):
    name: str
    ref: str
    kind: BranchKind
    is_current: bool = False
    is_default: bool = False
    sync_status: str = ""
    note: str = ""


class DiscoverRequest(BaseModel):
    config: GiteaConfig


class DiscoverResponse(BaseModel):
    repositories: list[RepoInfo]
    target_path: str


class SyncRequest(BaseModel):
    config: GiteaConfig
    repositories: list[RepoInfo]


class BranchStatusRequest(BaseModel):
    config: GiteaConfig
    repository: RepoInfo


class BranchStatusResponse(BaseModel):
    branch: BranchOption


class SyncItemResult(BaseModel):
    full_name: str
    local_path: str
    action: SyncAction
    success: bool
    message: str


class SyncResponse(BaseModel):
    results: list[SyncItemResult]
