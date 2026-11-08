# 更新日志

**dsh-memory（工作区记忆）** —— 把同一工作区每一轮对话的关键信息写成本地 Markdown，并在新会话开始时把相关历史注入上下文。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-11-08

首个公开版本。插件本身在本地已长期自用，这次整理成可上传 GitHub 的标准插件仓库：

### 新增
- **逐轮自动记录**：监听 `session/event`，在 `turn/end` 把该轮的用户要点、助手结论、调用过的工具、错误与 todo 进度追加进 `sessions/<日期>_<会话>.md`；会话中途接管时用 `recoverBuffer()` 从 `session.snapshotEvents()` 补记本轮。
- **新会话自动读取**：`agent/created` 时把 `MEMORY.md`、`PROGRESS.md` 与历史会话摘要组装成 `<dsh_memory>` 上下文注入（默认上限 8000 字符）。
- **三个模型工具**：`memory_note`（主动写事实/决定/偏好/进度/错误/待办）、`memory_search`（纯文本关键字检索，返回 `文件:行号: 内容`）、`memory_status`（显示记忆目录、会话数、以及新会话将看到的确切注入内容）。
- **`relevance` 注入模式**：用本轮用户输入在本地做关键词打分挑选历史块（中文二字组 + 英文词），不调用模型、不增加网络请求；最近 1 块始终保留，0 命中时退回 `recent`。
- **工作区不可写时自动兜底**：退回 `~/.dsh/dsh-memory/<工作区名>-<hash>`。
- **零依赖零构建**：纯 ESM，只依赖 `node:` 内置模块。

### 仓库与工程
- 补齐 GitHub 标准插件形态：`package.json`（`dsh.bundle.patch`、`exports`、`files`、`scripts`）、`cordis.patch.yml`、`LICENSE`（MIT）、`CHANGELOG.md`、`docs/`、`test/selftest.mjs`、`scripts/`。
- 隐私防线：`.gitignore` 排除 `.dsh-memory/`、`.env*`、密钥、日志与本机私有笔记；`.githooks/check-secrets.mjs` + `.githooks/pre-commit` 在提交前拦截密钥串、家目录路径与隐私文件名。
- 自检脚本 `npm run check` = 语法检查 + 密钥检查 + 离线自检。
