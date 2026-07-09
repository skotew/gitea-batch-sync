# Gitea Batch Sync

[中文](README.md)

A local tool for batch cloning and updating Gitea repositories. The frontend is built with React + Vite, the backend uses Python + FastAPI, and the Python environment is managed with conda.

## Feasibility

Gitea provides a `/api/v1` REST API. This tool uses `/api/v1/user/repos` to list repositories accessible to the authenticated user, then inspects the local target directory and each repository's Git origin to determine local status.

Automatic action rules:

- Missing local directory: `clone`
- Existing Git repository with matching origin: `fetch origin`, then compare `HEAD...origin/<current-branch>`
- Each repository can choose a target branch. Branch options are labeled as local or remote
- Repository discovery only computes the current local branch status. Other local branches are refreshed on demand when selected
- Current local branch: `git pull --ff-only origin <branch>`
- Non-current local branch: fast-forward the local branch pointer without switching the working tree
- Remote branch: create or fast-forward the matching local branch, set its upstream, and leave the current working tree unchanged
- Tracked uncommitted changes, non-fast-forward target branches, or unknown remote state: skip and show the reason
- Existing non-Git directories or mismatched origins: `skip` and mark as conflict

During synchronization, the frontend first locks every repository in the selected batch, then calls the backend one repository at a time and displays progress, per-repository success or failure, and a compact Git output summary. The repository currently being synchronized shows a loading indicator on its card, while every repository in the batch temporarily disables selection and branch switching.

Conflict handling boundary:

- This tool does not automatically merge, rebase, stash, force overwrite, or delete local files.
- Tracked uncommitted changes, non-fast-forward target branches, mismatched origins, non-Git directories, and unknown remote states are skipped with a visible reason.
- Untracked files do not directly block sync. If an untracked file conflicts with a new remote path, Git will refuse to overwrite it and the user must handle it manually.
- After manual cleanup, refresh repository status from the page.

## Quick Start

Create the project-specific conda environment:

```bash
conda env create -f environment.yml
conda activate gitea-batch-sync
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
npm --prefix frontend install
```

Start the backend:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
npm --prefix frontend run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Internationalization

The frontend includes Chinese and English UI text. The language switcher is in the top operation area, and the selected language is saved in browser `localStorage`. Backend status values stay stable, while the frontend handles labels and common status messages.

## Branch Selection

- Repository discovery only computes the current local branch state to keep the list fast.
- Selecting another local branch triggers a separate status refresh for that branch against `origin/<branch>`.
- While branch status is loading, the repository card shows a loading indicator and temporarily disables card actions.
- Selecting a remote branch does not compute local ahead/behind state. Sync will create or fast-forward the corresponding local branch and set its upstream to the matching `origin/<branch>`.
- The backend sync endpoint always rechecks the working tree, origin, tracked changes, and fast-forward conditions before running Git commands. Frontend state is used only for display and interaction.

## Configuration

- `Gitea URL`: Root URL of the Gitea instance, for example `https://gitea.example.com`
- `Gitea API auth`: Used to list repositories. Username/password is the default; token auth is also supported
- `Git clone protocol`: Chooses whether clone/pull uses HTTP(S) URLs or SSH URLs
- `SSH key path`: Only available in SSH mode. Leave it empty to use `ssh-agent` or `~/.ssh/config`; when provided, the backend passes the path to Git and does not read or store the private key
- `Target path`: Parent directory for clone/pull operations
- `Local directory layout`:
  - `target/repo`: Use the repository name as the local directory
  - `target/owner/repo`: Create an owner directory first, useful when repositories from different owners share the same name

Authentication and clone protocol:

- Token / username-password is used by the Gitea API and does not affect the local directory layout.
- SSH clone/pull uses the machine's SSH key and does not use the password or token from the page.
- When an SSH key path is provided, the backend temporarily sets `GIT_SSH_COMMAND="ssh -i <key> -o IdentitiesOnly=yes"` for Git commands.
- HTTP(S) clone/pull uses temporary `GIT_ASKPASS` credentials and does not write usernames, passwords, or tokens into the remote URL.

## Logging

The backend uses Python standard `logging` and writes key runtime logs to the backend terminal. Logs include:

- Repository discovery start, completion, duration, and count
- Gitea API page requests and filtered repository count
- Local repository inspection results
- clone / pull / skip start, result, and compact message
- API errors, Gitea connection failures, Git fetch/compare failures

Logs do not print tokens, passwords, or SSH private key content. User information embedded in remote URLs is masked.

## Project Structure

```text
backend/
  main.py          # FastAPI routes
  gitea_client.py  # Gitea API client
  git_ops.py       # Local Git status checks and clone/pull operations
  models.py        # Request and response models
frontend/
  src/
    main.jsx
    styles.css
```

## Notes

This tool runs `git clone` and `git pull --ff-only` under the local target path you provide. Conflicting directories are skipped by default, and local files are not overwritten by the tool.

## License

Apache License 2.0. See [LICENSE](LICENSE).
