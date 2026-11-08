# 更新日志

**dsh-memory（工作区记忆）** —— 把同一工作区每一轮对话的关键信息写成本地 Markdown，并在新会话开始时把相关历史注入上下文。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 修复
- **记忆里的 `{{...}}` 会让整轮会话失败**：注入用的 `systemPrompt.context` 注册现在传 `interpolate: false`。`system-prompt` 默认对 context 文本做 `{{变量}}` 插值，MEMORY / PROGRESS / 历史会话里一旦出现成对 `{{...}}`（Vue/Handlebars 模板、GitHub Actions 的 `${{ }}`、代码片段），prompt 组装会抛 `unknown/malformed prompt variable`，该轮 turn 直接报错且不修文件就每轮复发；现在记忆文本一律按原文注入。自检新增两条断言锁定该行为。
- **截断方向导致新记忆静默失效**：`MEMORY.md` / 工作区根 `MEMORY.md` 超上限时改为保留「开头 + 最新部分」、`PROGRESS.md` 保留最新部分，并插入 `…（中间内容已省略，完整内容可用 memory_search 检索）…` 标记；历史轮次块同样保留两端（轮次标题 + 用户要点 / 助手结论 + 错误 + 状态）。此前只保开头，`memory_note` 追加在末尾的新条目永远进不了注入。
- **注入块边界可伪造**：digest 内来自记忆文件的内容会把 `<dsh_memory>` / `</dsh_memory>` 转义成 `&lt;…&gt;`，克隆来的仓库根 `MEMORY.md` 或手工编辑的文件不能再把伪造指令放到块外。

### 变更
- **`memory_note` 单条上限 2000 字符**：超出截断并在返回值里标记 `truncated: true`，避免一条超长 note 长期占满注入预算、挤掉其他记忆。
- **记忆路径报告改为真实路径**：工作区内仍返回 `.dsh-memory/...` 相对路径，fallback 目录则返回绝对路径（此前会报一个不存在的 `.dsh-memory/...`）；`memory_search` 的文件标签同步修正，fallback 目录现在也会创建 `.gitignore` 与 `README.md`。
- **轮次去重改用内存 `Set`**：首次写入时从已有会话文件恢复一次已写轮次，后续只查 `Set`；不再每轮读取整份会话日志（长会话下 O(n²) → O(1)），插件中途重载也能正确去重。自检新增 3 条（共 22 条）。
- **会话文件名改用 sha1 前缀**：`sessionSlug` 从“取会话 id 尾部 8 位”改为 sha1 前 10 位，避免不同 id 撞同一文件；当前会话日志改为按头部完整会话 id 排除（升级前旧命名的文件也能识别）。
- **`dirName` 校验**：只接受工作区内相对路径，绝对路径、盘符或含 `..` 的逃逸写法静默回退默认 `.dsh-memory`，避免把 `.gitignore` 与记忆文件写到工作区外。
- **CI 密钥守卫真正生效**：`check-secrets.mjs` 新增 `--all`（`git ls-files` 全量扫描），CI 与 `npm run check` 改用它；此前只查暂存区，干净 checkout 上恒过。自检新增 3 条（共 25 条）。

### 新增
- **会话索引 `index.md`**：会话首轮落盘时追加一行（日期 + 会话短 id + 首条用户输入摘要），并注入新会话上下文；老工作区首次加载时自动回填最近 200 个会话。解决“历史会话超过 `relevanceScanSessions` 后旧会话不可达”的问题，同时保持纯文本、零模型调用。

### 变更
- **子代理注入改为可选**：新增 `injectSubagents`（默认 `false`）。此前子代理虽然默认不记录，却仍会收到整段记忆上下文，白付 token；现在默认不注入，需要时显式打开。
- **已弃用 API 迁移**：相关度查询优先用 `session.deriveMessages()`（`user/message` 的 `data` 仍保留 `source.kind`），`snapshotEvents()` 只在旧运行时兜底；`systemPrompt` 改用 `agentCtx.get('systemPrompt')` 获取，不再依赖祖先 fiber 是否 inject。自检新增 4 条（共 29 条）。

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
