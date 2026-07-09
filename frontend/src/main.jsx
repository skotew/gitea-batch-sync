import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Download, GitPullRequestArrow, Info, RefreshCw, Search, Shield, X } from "lucide-react";
import "./styles.css";

const API = "http://127.0.0.1:8000";

const translations = {
  zh: {
    appSubtitle: "批量拉取与更新",
    apiGroup: "Gitea API",
    gitGroup: "Git 拉取",
    localGroup: "本地目录",
    apiAuth: "API 认证方式",
    username: "用户名",
    password: "密码",
    apiTip: "这一组只用于调用 Gitea API 获取当前用户可访问的仓库列表。",
    cloneProtocol: "Clone 协议",
    sshKeyPath: "SSH key 文件路径",
    sshKeyPlaceholder: "留空则使用 ssh-agent 或 ~/.ssh/config",
    sshTip: "指定路径时，后端只把路径传给 git 的 GIT_SSH_COMMAND，不读取、不保存私钥内容。",
    httpTip: "HTTP(S) clone/pull 会临时使用上面的 API 认证，不会把密码或 token 写入 remote URL。",
    targetPath: "目标路径",
    targetPlaceholder: "/path/to/local/workspace",
    directoryMode: "目录结构",
    modeName: "目标路径/repo",
    modeOwnerName: "目标路径/owner/repo",
    directoryTip: "目录结构只决定 clone 到本地哪里，不影响 Gitea 查询哪些仓库。",
    getRepos: "获取仓库列表",
    fetching: "获取中...",
    workspaceTitle: "仓库同步台",
    workspaceDesc: "自动判断待拉取、需更新、已最新、本地领先、已分叉和冲突目录。",
    syncing: "同步中...",
    repoSyncing: "正在同步...",
    syncSelected: "同步选中",
    all: "全部",
    missing: "待拉取",
    update: "需更新",
    current: "已最新",
    attention: "需处理",
    safetyTitle: "冲突处理暂不纳入自动同步范围",
    safetyText: "工具只会自动执行缺失仓库的 clone，以及目标分支的安全快进更新。当前分支会 pull；非当前本地分支会在不切换工作区的情况下快进分支指针；远程分支会创建或快进对应本地分支。已跟踪文件有未提交修改、分支无法快进、origin 不一致、非 Git 目录或远端状态未知都会跳过，并在仓库卡片或同步结果里显示原因。未跟踪文件不会直接阻止同步，但工具不会自动清理；如果与远端新增文件重名，Git 会拒绝覆盖。",
    searchPlaceholder: "搜索仓库或本地路径",
    branchSearchPlaceholder: "搜索分支",
    targetBranch: "目标分支",
    localBranch: "本地",
    remoteBranch: "远程",
    noBranches: "暂无分支",
    branchLoading: "正在加载分支状态...",
    selectAll: "全选当前",
    clear: "清空",
    expand: "展开",
    collapse: "收起",
    refreshStatus: "刷新状态",
    refreshing: "刷新中...",
    empty: "暂无仓库，先获取列表。",
    progressRunning: "正在同步",
    progressResult: "同步结果",
    close: "关闭",
    detail: "详情",
    successDetail: "成功详情",
    errorDetail: "异常详情",
    infoDetail: "执行详情",
    privateRepo: "私有",
    loadingDiscover: "正在获取仓库列表...",
    loadingRefresh: "正在刷新仓库状态...",
    loadedRepos: (count) => `已加载 ${count} 个仓库`,
    chooseRepo: "请先选择仓库",
    loadingSync: (count) => `正在同步 ${count} 个仓库...`,
    syncDone: "同步完成，全部成功",
    syncFailed: (count) => `同步完成，${count} 个失败`,
    requestFailed: "请求失败",
    status: {
      missing: "待拉取",
      update_available: "需更新",
      up_to_date: "已最新",
      local_changes: "本地修改",
      local_ahead: "本地领先",
      diverged: "已分叉",
      unknown: "未知",
      conflict: "冲突",
    },
    action: { clone: "clone", pull: "pull", skip: "跳过" },
  },
  en: {
    appSubtitle: "Batch clone and update",
    apiGroup: "Gitea API",
    gitGroup: "Git Sync",
    localGroup: "Local Directory",
    apiAuth: "API auth",
    username: "Username",
    password: "Password",
    apiTip: "This section is only used to call the Gitea API and list repositories accessible to the current user.",
    cloneProtocol: "Clone protocol",
    sshKeyPath: "SSH key path",
    sshKeyPlaceholder: "Leave empty to use ssh-agent or ~/.ssh/config",
    sshTip: "When a path is provided, the backend only passes it to GIT_SSH_COMMAND. It does not read or store the private key.",
    httpTip: "HTTP(S) clone/pull uses the API credentials temporarily and never writes passwords or tokens into remote URLs.",
    targetPath: "Target path",
    targetPlaceholder: "/path/to/local/workspace",
    directoryMode: "Directory layout",
    modeName: "target/repo",
    modeOwnerName: "target/owner/repo",
    directoryTip: "Directory layout only controls where repositories are cloned locally. It does not affect the Gitea query.",
    getRepos: "Load repositories",
    fetching: "Loading...",
    workspaceTitle: "Repository Console",
    workspaceDesc: "Detects missing, updateable, current, local-ahead, diverged, and conflicting repositories.",
    syncing: "Syncing...",
    repoSyncing: "Syncing...",
    syncSelected: "Sync selected",
    all: "All",
    missing: "Missing",
    update: "Updates",
    current: "Current",
    attention: "Needs attention",
    safetyTitle: "Conflict handling is outside automatic sync",
    safetyText: "The tool only clones missing repositories and safely fast-forwards the selected target branch. The current branch is pulled; a non-current local branch is fast-forwarded without switching the working tree; a remote branch creates or fast-forwards its matching local branch. Tracked local changes, non-fast-forward branches, origin mismatches, non-Git directories, and unknown remote states are skipped with a reason on the repository card or sync result. Untracked files do not block sync directly, but the tool will not clean them. If an untracked file conflicts with a remote path, Git will refuse to overwrite it.",
    searchPlaceholder: "Search repository or local path",
    branchSearchPlaceholder: "Search branches",
    targetBranch: "Target branch",
    localBranch: "Local",
    remoteBranch: "Remote",
    noBranches: "No branches",
    branchLoading: "Loading branch status...",
    selectAll: "Select current",
    clear: "Clear",
    expand: "Expand",
    collapse: "Collapse",
    refreshStatus: "Refresh status",
    refreshing: "Refreshing...",
    empty: "No repositories yet. Load the list first.",
    progressRunning: "Syncing",
    progressResult: "Sync result",
    close: "Close",
    detail: "Details",
    successDetail: "Success details",
    errorDetail: "Error details",
    infoDetail: "Execution details",
    privateRepo: "Private",
    loadingDiscover: "Loading repository list...",
    loadingRefresh: "Refreshing repository status...",
    loadedRepos: (count) => `Loaded ${count} repositories`,
    chooseRepo: "Select repositories first",
    loadingSync: (count) => `Syncing ${count} repositories...`,
    syncDone: "Sync completed successfully",
    syncFailed: (count) => `Sync completed with ${count} failures`,
    requestFailed: "Request failed",
    status: {
      missing: "Missing",
      update_available: "Update available",
      up_to_date: "Current",
      local_changes: "Local changes",
      local_ahead: "Local ahead",
      diverged: "Diverged",
      unknown: "Unknown",
      conflict: "Conflict",
    },
    action: { clone: "clone", pull: "pull", skip: "skip" },
  },
};

const emptyConfig = {
  base_url: "",
  auth_type: "basic",
  username: "",
  password: "",
  token: "",
  target_path: "",
  directory_mode: "name",
  clone_protocol: "http",
  ssh_key_path: "",
};

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem("gitea_batch_sync_language") || "zh");
  const t = translations[language] || translations.zh;
  const [config, setConfig] = useState(() => ({ ...emptyConfig, ...readConfig() }));
  const [repos, setRepos] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyNotice, setBusyNotice] = useState(null);
  const [messageNotice, setMessageNotice] = useState(null);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ running: false, done: 0, total: 0, current: "" });
  const [syncingRepo, setSyncingRepo] = useState("");
  const [syncBatch, setSyncBatch] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);

  const filteredRepos = useMemo(() => {
    return repos.filter((repo) => {
      const hitStatus = statusMatches(repo.local_status, status);
      const text = `${repo.full_name} ${repo.local_path}`.toLowerCase();
      return hitStatus && (!keyword || text.includes(keyword.toLowerCase()));
    });
  }, [repos, status, keyword]);

  const counts = useMemo(() => ({
    all: repos.length,
    missing: repos.filter((item) => item.local_status === "missing").length,
    update: repos.filter((item) => item.local_status === "update_available").length,
    current: repos.filter((item) => item.local_status === "up_to_date").length,
    attention: repos.filter((item) => needsAttention(item.local_status)).length,
  }), [repos]);
  const branchStatusLoading = useMemo(() => repos.some(selectedBranchLoading), [repos]);
  const busyText = formatNotice(busyNotice, t, language);
  const message = formatNotice(messageNotice, t, language);

  function updateConfig(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function updateLanguage(value) {
    setLanguage(value);
    localStorage.setItem("gitea_batch_sync_language", value);
  }

  function showToast(type, notice, sticky = false, detailNotice = null) {
    setToast({ type, notice, detail: detailNotice || notice });
    window.clearTimeout(showToast.timer);
    if (!sticky) {
      showToast.timer = window.setTimeout(() => setToast(null), 5000);
    }
  }

  function showMessage(notice, autoClearMs = 0) {
    window.clearTimeout(showMessage.timer);
    setMessageNotice(notice);
    if (autoClearMs > 0) {
      showMessage.timer = window.setTimeout(() => {
        setMessageNotice((current) => (current === notice ? null : current));
      }, autoClearMs);
    }
  }

  async function discover(keepResults = false) {
    setBusy(true);
    const loadingNotice = { key: keepResults ? "loadingRefresh" : "loadingDiscover" };
    setBusyNotice(loadingNotice);
    showMessage(loadingNotice);
    showToast("info", loadingNotice, true);
    if (!keepResults) setResults([]);
    try {
      const requestConfig = sanitizeConfig(config);
      localStorage.setItem("gitea_batch_sync_config", JSON.stringify({ ...requestConfig, password: "", token: "" }));
      const payload = await postJson("/api/repositories/discover", { config: requestConfig }, t);
      setRepos(payload.repositories || []);
      setSelected(new Set());
      const loadedNotice = { key: "loadedRepos", args: [payload.repositories?.length || 0] };
      showMessage(loadedNotice, 5000);
      showToast("success", loadedNotice);
    } catch (error) {
      const errorNotice = { text: error.message };
      showMessage(errorNotice);
      showToast("error", errorNotice, false, { text: error.detail || error.message });
    } finally {
      setBusy(false);
      setBusyNotice(null);
    }
  }

  async function syncSelected() {
    if (branchStatusLoading) return;
    const picked = repos.filter((repo) => selected.has(repo.full_name));
    if (!picked.length) {
      showMessage({ key: "chooseRepo" }, 5000);
      return;
    }
    setBusy(true);
    const loadingNotice = { key: "loadingSync", args: [picked.length] };
    setBusyNotice(loadingNotice);
    showMessage(loadingNotice);
    showToast("info", loadingNotice, true);
    setResults([]);
    setSyncBatch(new Set(picked.map((repo) => repo.full_name)));
    setProgress({ running: true, done: 0, total: picked.length, current: picked[0]?.full_name || "" });
    try {
      const nextResults = [];
      for (let index = 0; index < picked.length; index += 1) {
        const repo = picked[index];
        setSyncingRepo(repo.full_name);
        setProgress({ running: true, done: index, total: picked.length, current: repo.full_name });
        const payload = await postJson("/api/repositories/sync", { config: sanitizeConfig(config), repositories: [repo] }, t);
        const item = payload.results?.[0];
        if (item) {
          nextResults.push(item);
          setResults([...nextResults]);
        }
        setProgress({ running: true, done: index + 1, total: picked.length, current: repo.full_name });
      }
      const failed = nextResults.filter((item) => !item.success).length;
      await discover(true);
      const doneNotice = failed ? { key: "syncFailed", args: [failed] } : { key: "syncDone" };
      showMessage(doneNotice, failed ? 0 : 5000);
      showToast(failed ? "error" : "success", doneNotice);
    } catch (error) {
      const errorNotice = { text: error.message };
      showMessage(errorNotice);
      showToast("error", errorNotice, false, { text: error.detail || error.message });
    } finally {
      setProgress((prev) => ({ ...prev, running: false, current: "" }));
      setSyncingRepo("");
      setSyncBatch(new Set());
      setBusy(false);
      setBusyNotice(null);
    }
  }

  function toggleAll(value) {
    if (busy) return;
    setSelected(new Set(value ? filteredRepos.filter((repo) => repo.action !== "skip" && !isRepoLocked(repo, syncingRepo, syncBatch)).map((repo) => repo.full_name) : []));
  }

  function toggleRepo(fullName) {
    const repo = repos.find((item) => item.full_name === fullName);
    if (busy || (repo && isRepoLocked(repo, syncingRepo, syncBatch))) return;
    const next = new Set(selected);
    next.has(fullName) ? next.delete(fullName) : next.add(fullName);
    setSelected(next);
  }

  async function updateRepoBranch(fullName, branch) {
    if (!branch) return;
    const targetRepo = repos.find((repo) => repo.full_name === fullName);
    if (targetRepo && isRepoLocked(targetRepo, syncingRepo, syncBatch)) return;
    const shouldLoadStatus = branch.kind === "local" && (!branch.is_current || !branch.sync_status);
    setRepos((items) => items.map((repo) => {
      if (repo.full_name !== fullName) return repo;
      return {
        ...repo,
        selected_branch_ref: branch.ref,
        branches: (repo.branches || []).map((item) => (
          item.ref === branch.ref ? { ...item, loading: shouldLoadStatus, note: shouldLoadStatus ? "" : item.note } : item
        )),
      };
    }));
    if (!targetRepo || !shouldLoadStatus) return;
    try {
      const payload = await postJson(
        "/api/repositories/branch-status",
        { config: sanitizeConfig(config), repository: { ...targetRepo, selected_branch_ref: branch.ref } },
        t,
      );
      setRepos((items) => items.map((repo) => {
        if (repo.full_name !== fullName) return repo;
        return {
          ...repo,
          branches: (repo.branches || []).map((item) => (
            item.ref === branch.ref ? { ...item, ...payload.branch, loading: false } : item
          )),
        };
      }));
    } catch (error) {
      setRepos((items) => items.map((repo) => {
        if (repo.full_name !== fullName) return repo;
        return {
          ...repo,
          branches: (repo.branches || []).map((item) => (
            item.ref === branch.ref ? { ...item, loading: false, sync_status: "unknown", note: error.message } : item
          )),
        };
      }));
      showToast("error", { text: error.message }, false, { text: error.detail || error.message });
    }
  }

  return (
    <div className="app">
      <Toast toast={toast} onClose={() => setToast(null)} onDetail={() => setDetail(toast)} t={t} language={language} />
      <DetailModal detail={detail} onClose={() => setDetail(null)} t={t} language={language} />
      <header className="topbar">
        <div className="brand">
          <div className="brand-title">
            <GitPullRequestArrow size={26} />
            <div>
              <strong>Gitea Batch Sync</strong>
              <span>{t.appSubtitle}</span>
            </div>
          </div>
          <label className="language-control">
            <span>{language === "zh" ? "语言" : "Language"}</span>
            <select className="language-select" value={language} onChange={(event) => updateLanguage(event.target.value)} aria-label="Language">
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        <section className="panel">
          <ConfigGroup title={t.apiGroup}>
            <Field label="Gitea URL">
              <input value={config.base_url} placeholder="https://gitea.example.com" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
            <Field label={t.apiAuth}>
              <select value={config.auth_type} onChange={(event) => updateConfig("auth_type", event.target.value)}>
                <option value="basic">{language === "zh" ? "用户名密码" : "Username/password"}</option>
                <option value="token">Token</option>
              </select>
            </Field>
            {config.auth_type === "token" ? (
              <Field label="Access Token">
                <input value={config.token} type="password" placeholder="Gitea token" onChange={(event) => updateConfig("token", event.target.value)} />
              </Field>
            ) : (
              <div className="two">
                <Field label={t.username}>
                  <input value={config.username} onChange={(event) => updateConfig("username", event.target.value)} />
                </Field>
                <Field label={t.password}>
                  <input value={config.password} type="password" onChange={(event) => updateConfig("password", event.target.value)} />
                </Field>
              </div>
            )}
            <Tip>{t.apiTip}</Tip>
          </ConfigGroup>

          <ConfigGroup title={t.gitGroup}>
            <Field label={t.cloneProtocol}>
              <select value={config.clone_protocol} onChange={(event) => updateConfig("clone_protocol", event.target.value)}>
                <option value="http">HTTP(S)</option>
                <option value="ssh">SSH</option>
              </select>
            </Field>
            {config.clone_protocol === "ssh" ? (
              <>
                <Field label={t.sshKeyPath}>
                  <input value={config.ssh_key_path} placeholder={t.sshKeyPlaceholder} onChange={(event) => updateConfig("ssh_key_path", event.target.value)} />
                </Field>
                <Tip tone="ssh">{t.sshTip}</Tip>
              </>
            ) : (
              <Tip tone="http">{t.httpTip}</Tip>
            )}
          </ConfigGroup>

          <ConfigGroup title={t.localGroup}>
            <Field label={t.targetPath}>
              <input value={config.target_path} placeholder={t.targetPlaceholder} onChange={(event) => updateConfig("target_path", event.target.value)} />
            </Field>
            <Field label={t.directoryMode}>
              <select value={config.directory_mode} onChange={(event) => updateConfig("directory_mode", event.target.value)}>
                <option value="name">{t.modeName}</option>
                <option value="owner_name">{t.modeOwnerName}</option>
              </select>
            </Field>
            <Tip>{t.directoryTip}</Tip>
          </ConfigGroup>

        </section>
      </header>

      <main className="content">
        <header className="toolbar">
          <div>
            <h1>{t.workspaceTitle}</h1>
            <p>{t.workspaceDesc}</p>
          </div>
          <div className="toolbar-actions">
            <button className="primary" disabled={busy} onClick={() => discover()}>
              <Search size={18} />
              {busyNotice?.key === "loadingDiscover" ? t.fetching : t.getRepos}
            </button>
            <button className="primary" disabled={busy || branchStatusLoading || !selected.size} onClick={syncSelected}>
              <Download size={18} />
              {progress.running ? t.syncing : `${t.syncSelected} ${selected.size}`}
            </button>
          </div>
        </header>

        <section className="summary">
          <Stat label={t.all} value={counts.all} active={status === "all"} onClick={() => setStatus("all")} />
          <Stat label={t.missing} value={counts.missing} active={status === "missing"} onClick={() => setStatus("missing")} />
          <Stat label={t.update} value={counts.update} active={status === "update_available"} onClick={() => setStatus("update_available")} />
          <Stat label={t.current} value={counts.current} active={status === "up_to_date"} onClick={() => setStatus("up_to_date")} />
          <Stat label={t.attention} value={counts.attention} active={status === "attention"} onClick={() => setStatus("attention")} />
        </section>

        <SafetyTip t={t} />

        <BusyBanner text={busyText} />

        <ProgressPanel progress={progress} results={results} onClear={() => setResults([])} t={t} language={language} />

        <section className="repo-panel">
          <div className="repo-tools">
            <div className="searchbox">
              <Search size={17} />
              <input value={keyword} placeholder={t.searchPlaceholder} onChange={(event) => setKeyword(event.target.value)} />
            </div>
            <button onClick={() => toggleAll(true)} disabled={busy}>{t.selectAll}</button>
            <button onClick={() => toggleAll(false)} disabled={busy}>{t.clear}</button>
            <button onClick={() => discover(true)} disabled={busy || !repos.length}>
              <RefreshCw size={16} />
              {busyNotice?.key === "loadingRefresh" ? t.refreshing : t.refreshStatus}
            </button>
          </div>

          {message ? (
            <div className="message">
              <span>{message}</span>
              <button className="icon-button" type="button" aria-label={t.close} onClick={() => setMessageNotice(null)}>
                <X size={15} />
              </button>
            </div>
          ) : null}

          <div className="repo-list">
            {filteredRepos.length ? filteredRepos.map((repo) => (
              <RepoCard
                key={repo.full_name}
                repo={repo}
                selected={selected.has(repo.full_name)}
                locked={isRepoLocked(repo, syncingRepo, syncBatch)}
                loadingText={syncingRepo === repo.full_name ? t.repoSyncing : selectedBranchLoading(repo) ? t.branchLoading : ""}
                language={language}
                t={t}
                onToggle={() => toggleRepo(repo.full_name)}
                onBranchChange={(branch) => updateRepoBranch(repo.full_name, branch)}
              />
            )) : <div className="empty">{t.empty}</div>}
          </div>
        </section>

      </main>
    </div>
  );
}

function RepoCard({ repo, selected, locked, loadingText, language, t, onToggle, onBranchChange }) {
  return (
    <article className={`repo-card ${locked ? "locked" : ""}`}>
      {loadingText ? <div className="repo-card-loading"><span />{loadingText}</div> : null}
      <label className="repo-check">
        <input type="checkbox" disabled={locked || repo.action === "skip"} checked={selected} onChange={onToggle} />
      </label>
      <div className="repo-main">
        <div className="repo-title">
          <strong>{repo.full_name}</strong>
          <StatusBadge status={repo.local_status} action={repo.action} t={t} />
          {repo.private ? <span className="private"><Shield size={14} />{t.privateRepo}</span> : null}
        </div>
        <div className="repo-path">{repo.local_path}</div>
        <div className="repo-url">{repo.selected_url}</div>
        <BranchPicker key={locked ? "locked" : "active"} repo={repo} t={t} disabled={locked} onChange={onBranchChange} />
        <RepoNote repo={repo} language={language} t={t} />
      </div>
    </article>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function ConfigGroup({ title, children }) {
  return <div className="config-group"><h2>{title}</h2>{children}</div>;
}

function Tip({ children, tone = "info" }) {
  return <div className={`tip ${tone}`}><Info size={15} />{children}</div>;
}

function Stat({ label, value, active, onClick }) {
  return <button className={`stat ${active ? "active" : ""}`} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>;
}

function StatusBadge({ status, action, t }) {
  return <span className={`badge ${status}`}>{t.status[status] || status} · {t.action[action] || action}</span>;
}

function RepoNote({ repo, language, t }) {
  const note = selectedBranchNote(repo, t) || repositoryNote(repo);
  if (!note) return null;
  const tone = selectedBranchNote(repo, t) ? noteTone(selectedBranchStatus(repo)) : noteTone(repo.local_status);
  const Icon = tone === "error" ? X : Info;
  return <div className={`repo-note ${tone}`}><Icon size={14} />{localizeBackendText(note, language)}</div>;
}

function selectedBranch(repo) {
  return (repo.branches || []).find((branch) => branch.ref === repo.selected_branch_ref);
}

function selectedBranchLoading(repo) {
  return Boolean(selectedBranch(repo)?.loading);
}

function isRepoLocked(repo, syncingRepo, syncBatch = new Set()) {
  return syncBatch.has(repo.full_name) || repo.full_name === syncingRepo || selectedBranchLoading(repo);
}

function selectedBranchNote(repo, t = translations.zh) {
  const branch = selectedBranch(repo);
  if (branch?.kind === "local" && branch.loading) return t.branchLoading;
  return branch?.kind === "local" ? branch.note : "";
}

function selectedBranchStatus(repo) {
  const branch = selectedBranch(repo);
  return branch?.loading ? "loading" : branch?.sync_status || "";
}

function repositoryNote(repo) {
  return ["conflict", "local_changes", "unknown"].includes(repo.local_status) ? repo.note : "";
}

function BranchPicker({ repo, t, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const branches = repo.branches || [];
  const selected = branches.find((branch) => branch.ref === repo.selected_branch_ref) || branches[0];
  const filtered = branches.filter((branch) => branch.name.toLowerCase().includes(query.toLowerCase()));

  if (!branches.length) {
    return (
      <div className="branch-field">
        <span>{t.targetBranch}</span>
        <div className="branch-empty">{t.noBranches}</div>
      </div>
    );
  }

  return (
    <div className="branch-field">
      <span>{t.targetBranch}</span>
      <div className="branch-picker">
        <button type="button" className="branch-trigger" disabled={disabled} onClick={() => setOpen((value) => !value)}>
          <BranchLabel branch={selected} t={t} />
          <span className="branch-arrow" />
        </button>
        {open ? (
          <div className="branch-menu">
            <div className="branch-search">
              <Search size={15} />
              <input value={query} placeholder={t.branchSearchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="branch-options">
              {filtered.length ? filtered.map((branch) => (
                <button
                  type="button"
                  className={`branch-option ${branch.ref === selected?.ref ? "active" : ""}`}
                  key={branch.ref}
                  disabled={disabled}
                  onClick={() => {
                    onChange(branch);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <BranchLabel branch={branch} t={t} />
                </button>
              )) : <div className="branch-empty">{t.noBranches}</div>}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BranchLabel({ branch, t }) {
  if (!branch) return null;
  return (
    <span className="branch-label">
      <span className="branch-name">{branch.name}</span>
      <span className={`branch-kind ${branch.kind}`}>{branch.kind === "local" ? t.localBranch : t.remoteBranch}</span>
      {branch.loading ? <span className="branch-loading" aria-label={t.branchLoading} /> : null}
    </span>
  );
}

function noteTone(status) {
  if (status === "loading") return "info";
  if (status === "conflict") return "error";
  if (["local_changes", "local_ahead", "diverged", "unknown"].includes(status)) return "attention";
  return "info";
}

function ProgressPanel({ progress, results, onClear, t, language }) {
  const [expanded, setExpanded] = useState(false);
  if (!progress.running && !results.length) return null;
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <section className="progress-panel">
      <div className="progress-head">
        <strong>{progress.running ? t.progressRunning : t.progressResult}</strong>
        <div>
          <span>{progress.done}/{progress.total || results.length}</span>
          {results.length ? <button onClick={() => setExpanded((value) => !value)}>{expanded ? t.collapse : t.expand}</button> : null}
          {!progress.running && results.length ? <button onClick={onClear}>{t.clear}</button> : null}
        </div>
      </div>
      <div className="progress-track"><div style={{ width: `${percent}%` }} /></div>
      {progress.current ? <div className="progress-current">{progress.current}</div> : null}
      {expanded && results.length ? (
        <div className="progress-results">
          {results.map((item) => (
            <div className={`progress-row ${item.success ? "success" : "failed"}`} key={`${item.full_name}-${item.action}`}>
              {item.success ? <Check size={15} /> : <X size={15} />}
              <span>{item.full_name}</span>
              <em>{t.action[item.action] || item.action}</em>
              <p>{localizeBackendText(item.message, language)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SafetyTip({ t }) {
  return (
    <section className="safety-tip">
      <Info size={18} />
      <div>
        <strong>{t.safetyTitle}</strong>
        <p>{t.safetyText}</p>
      </div>
    </section>
  );
}

function BusyBanner({ text }) {
  if (!text) return null;
  return (
    <section className="busy-banner">
      <span />
      <strong>{text}</strong>
    </section>
  );
}

function Toast({ toast, onClose, onDetail, t, language }) {
  if (!toast) return null;
  const Icon = toast.type === "success" ? Check : toast.type === "error" ? X : Info;
  const canShowDetail = toast.type === "error" && Boolean(toast.detail);
  const text = formatNotice(toast.notice, t, language);
  return (
    <div className={`toast ${toast.type}`}>
      <Icon size={17} />
      <span>{text}</span>
      {canShowDetail ? <button onClick={onDetail}>{t.detail}</button> : null}
      <button className="icon-button" type="button" aria-label={t.close} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

function DetailModal({ detail, onClose, t, language }) {
  if (!detail) return null;
  const titleMap = { success: t.successDetail, error: t.errorDetail, info: t.infoDetail };
  const titleText = formatNotice(detail.notice, t, language);
  const content = formatNotice(detail.detail || detail.notice, t, language);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label={titleMap[detail.type] || t.detail} onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{titleMap[detail.type] || t.detail}</strong>
            <span>{titleText}</span>
          </div>
          <button className="icon-button" type="button" aria-label={t.close} onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <pre>{content}</pre>
      </section>
    </div>
  );
}

function statusMatches(localStatus, selectedStatus) {
  if (selectedStatus === "all") return true;
  if (selectedStatus === "attention") return needsAttention(localStatus);
  return localStatus === selectedStatus;
}

function needsAttention(localStatus) {
  return ["conflict", "local_changes", "local_ahead", "diverged", "unknown"].includes(localStatus);
}

async function postJson(path, payload, t = translations.zh) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = formatErrorDetail(data.detail || data || translations.zh.requestFailed || t.requestFailed);
    const error = new Error(summarizeText(detail));
    error.detail = detail;
    throw error;
  }
  return data;
}

function formatErrorDetail(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizeText(value) {
  const text = String(value || "请求失败").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function formatNotice(notice, t, language) {
  if (!notice) return "";
  if (typeof notice === "string") return localizeBackendText(notice, language);
  if (notice.key) {
    const template = t[notice.key];
    if (typeof template === "function") return template(...(notice.args || []));
    return template || "";
  }
  return localizeBackendText(notice.text || "", language);
}

function localizeBackendText(value, language) {
  const text = String(value || "");
  if (language !== "en") return text;
  const replacements = [
    [/Gitea URL 必须以 http:\/\/ 或 https:\/\/ 开头/g, "Gitea URL must start with http:// or https://"],
    [/本地目标路径不是目录/g, "Local target path is not a directory"],
    [/Gitea API 请求失败：/g, "Gitea API request failed: "],
    [/无法连接 Gitea：/g, "Unable to connect to Gitea: "],
    [/目标目录已存在，但不是 Git 仓库/g, "Target directory exists but is not a Git repository"],
    [/本地 origin 与 Gitea 地址不一致/g, "Local origin does not match the Gitea clone URL"],
    [/本地已跟踪文件存在未提交修改，请先 commit、stash 或还原后再同步/g, "Tracked files have uncommitted changes. Commit, stash, or restore them before syncing"],
    [/本地已跟踪文件存在未提交修改，已跳过/g, "Tracked files have uncommitted changes. Skipped"],
    [/无法获取远端状态，可尝试同步或检查凭证/g, "Unable to fetch remote state. Try syncing or check credentials"],
    [/无法识别当前分支/g, "Unable to detect current branch"],
    [/找不到对应的远端分支/g, "No matching remote branch found"],
    [/找不到远端分支 ([^\n]+)/g, "Remote branch $1 was not found"],
    [/无法比较本地与远端提交/g, "Unable to compare local and remote commits"],
    [/已是最新/g, "Already up to date"],
    [/存在未跟踪文件，工具不会自动处理/g, "Untracked files exist; the tool will not handle them automatically"],
    [/本地领先 (\d+) 个提交，远端领先 (\d+) 个提交/g, "Local is ahead by $1 commits; remote is ahead by $2 commits"],
    [/本地领先 (\d+) 个提交/g, "Local is ahead by $1 commits"],
    [/远端领先 (\d+) 个提交/g, "Remote is ahead by $1 commits"],
    [/未选择目标分支/g, "No target branch selected"],
    [/本地分支 ([^\s]+) 领先或已分叉，不能自动更新/g, "Local branch $1 is ahead or diverged and cannot be updated automatically"],
    [/clone 完成/g, "clone completed"],
    [/pull 完成/g, "pull completed"],
    [/完成/g, "completed"],
    [/执行失败/g, "execution failed"],
    [/已跳过/g, "skipped"],
    [/请求失败/g, "Request failed"],
  ];
  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function readConfig() {
  try {
    return JSON.parse(localStorage.getItem("gitea_batch_sync_config") || "{}");
  } catch {
    return {};
  }
}

function sanitizeConfig(config) {
  const {
    base_url,
    auth_type,
    username,
    password,
    token,
    target_path,
    directory_mode,
    clone_protocol,
    ssh_key_path,
  } = config;
  return { base_url, auth_type, username, password, token, target_path, directory_mode, clone_protocol, ssh_key_path };
}

createRoot(document.getElementById("root")).render(<App />);
