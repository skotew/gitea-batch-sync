# Gitea Batch Sync

[English](README.en.md)

一个用于批量拉取、更新 Gitea 仓库的本地工具。前端使用 React + Vite，后端使用 Python + FastAPI，Python 环境通过 conda 管理。

## 可行性

Gitea 提供 `/api/v1` REST API，可以通过 token 或用户名密码访问当前用户有权限的仓库。工具会调用当前用户仓库接口 `/api/v1/user/repos`；本地侧通过扫描目标目录和读取 Git origin 判断仓库状态。

自动动作规则：

- 本地目录不存在：`clone`
- 本地目录存在且 origin 匹配：先 `fetch origin`，再比较 `HEAD...origin/<当前分支>`
- 当前本地分支没有对应的 `origin/<branch>`：标记为未知并跳过，不会回退为比较默认分支
- 用户可为每个仓库选择目标分支，分支选项会标注本地或远程；没有对应 `origin/<branch>` 的本地分支会额外标注“仅本地”，不会参与同步
- 当前本地分支：`git pull --ff-only origin <branch>`
- 非当前本地分支：不切换工作区，只在可 fast-forward 时移动本地分支指针
- 远程分支：以远程分支为来源创建或更新本地同名分支；新建本地分支或更新非当前本地分支时会设置 upstream，当前分支则使用显式 pull 更新
- 已跟踪文件有未提交修改、目标分支无法 fast-forward 或状态未知：默认跳过并标注状态
- 本地目录存在但不是 Git 仓库，或 origin 不一致：`skip` 并标记冲突

同步执行时前端会先锁定本批次选中的所有仓库，再逐个仓库调用后端接口，展示当前进度、每个仓库的成功、跳过、失败和 Git 输出摘要。当前正在同步的仓库卡片会显示 loading；本批次内的仓库都会暂时禁用选择和分支切换操作，避免同步过程中修改目标。

冲突处理边界：

- 本工具暂不自动处理 merge、rebase、stash、强制覆盖或删除本地文件。
- 已跟踪文件有未提交修改、目标分支无法 fast-forward、origin 不一致、非 Git 目录、远端状态未知都会跳过，并在仓库卡片或同步结果中提示具体原因。
- 未跟踪文件不会直接阻止同步，页面只做说明提示；如果未跟踪文件与远端新增文件重名，Git 会拒绝覆盖，用户需要手动处理。
- 用户需要进入对应本地目录手动处理后，再回到页面刷新状态。

## 快速启动

创建当前项目专用 conda 环境：

```bash
conda env create -f environment.yml
conda activate gitea-batch-sync
pip install -r requirements.txt
```

安装前端依赖：

```bash
npm --prefix frontend install
```

启动后端：

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

启动前端：

```bash
npm --prefix frontend run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。

## 多语系

前端内置中文和英文界面，页面顶部操作区可切换语言，选择会保存到浏览器 `localStorage`。后端状态码保持稳定，前端负责展示对应语言的标签和常见状态说明。

## 分支选择

- 仓库列表加载时只计算当前本地分支与远端的差异，避免一次性检查所有分支导致列表加载过慢。
- 选择其他本地分支时，前端会单独刷新该分支与 `origin/<branch>` 的状态；刷新期间该仓库卡片会显示 loading，并暂时禁用卡片操作。
- “仅本地”标签表示该本地分支没有对应的 `origin/<branch>`，通常是尚未推送到远端或远端分支已删除；工具只做标识，不会同步该分支。
- 选择远程分支时不会做本地 ahead/behind 对比；同步时会以该远程分支为来源创建或更新本地同名分支。新建本地分支或更新非当前本地分支时会设置 upstream 到对应的 `origin/<branch>`；如果同名本地分支正好是当前分支，则使用显式 pull 更新。
- 同步接口在后端仍会重新检查工作区、origin、未提交的已跟踪文件、仅本地分支和 fast-forward 条件，前端状态只用于展示和交互。

## 配置说明

- `Gitea URL`: Gitea 根地址，例如 `https://gitea.example.com`
- `Gitea API 认证`: 用于获取仓库列表，默认使用用户名密码；也可以切换为 token
- `新仓库 Clone 协议`: 只决定新 clone 仓库使用 HTTP(S) 地址还是 SSH 地址；不会改写已有仓库的 origin
- `SSH key 文件路径`: 仅 SSH 模式可填。留空时使用本机 ssh-agent 或 `~/.ssh/config`；填写时后端只把路径传给 git，不读取、不保存私钥内容
- `本地目标路径`: clone/pull 的父目录
- `本地目录结构`:
  - `目标路径/repo`: 使用仓库名作为本地目录
  - `目标路径/owner/repo`: 先创建 owner 目录，再把仓库放到 owner 下面，适合不同组织下仓库重名的情况

认证和 clone 协议的关系：

- Token / 用户名密码只用于 Gitea API，不决定本地目录结构。
- 已有仓库始终通过自身 `origin` 更新。切换页面协议不会自动修改 `origin`；若页面协议与已有 `origin` 不一致，仓库会标记为冲突，需先在本地手动调整 `origin`。
- SSH clone/pull 使用本机 SSH key，不使用页面里的密码或 token。
- 指定 SSH key 路径时，后端执行 git 时临时设置 `GIT_SSH_COMMAND="ssh -i <key> -o IdentitiesOnly=yes"`。
- HTTP(S) clone/pull 会通过临时 `GIT_ASKPASS` 使用页面里的认证信息，不会把用户名密码或 token 写入 remote URL。

## 日志

后端使用 Python 标准 `logging` 输出关键运行日志，默认打印到启动后端的终端。日志覆盖：

- 仓库列表加载开始、完成、耗时和数量
- Gitea API 分页请求和过滤后的仓库数量
- 本地仓库状态判断结果
- clone / pull / skip 的开始、结果和简要信息
- 接口异常、Gitea 连接异常、Git fetch/compare 失败

日志不会输出 token、密码或 SSH 私钥内容；remote URL 中可能存在的用户信息会脱敏。

## 项目结构

```text
backend/
  main.py          # FastAPI 路由
  gitea_client.py  # Gitea API 客户端
  git_ops.py       # 本地 Git 状态判断与 clone/pull
  models.py        # 请求响应模型
frontend/
  src/
    main.jsx
    styles.css
```

## 注意

本工具会在你填写的本地目标路径下执行 `git clone` 和 `git pull --ff-only`。冲突目录默认跳过，不会覆盖本地文件。

## License

Apache License 2.0. See [LICENSE](LICENSE).
