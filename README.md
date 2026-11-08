# dsh-memory · DSH 工作区记忆

> 同一工作区、跨会话的**纯文本**记忆插件（DeepSeek Harness / DSH Host 插件）。
> 每一轮对话自动记成 Markdown → 新会话自动把相关历史读回来。

[![license: MIT](https://img.shields.io/badge/license-MIT-4F7CFF.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-1.0.0-F5A524.svg)](https://github.com/HluckyRing/dsh-memory)

没有数据库、没有向量检索、没有额外模型调用、没有 `node_modules` —— 全部是可读、可改、可直接删的 Markdown 文件。

---

## 它解决什么问题

DSH 开新会话时，agent 对上一个会话聊了什么一无所知：为什么这么改、踩过哪个坑、下一步要做什么，全靠你复述。

本插件只做一件事，并把这件事做干净：

**每一轮对话自动记成文本 → 新会话自动读回来。**

## 功能

| 能力 | 触发方式 | 结果 |
| --- | --- | --- |
| 自动建骨架 | 自动，进入新的工作区 / 新会话 | 创建 `.dsh-memory/`，生成带表头的 `MEMORY.md`、`PROGRESS.md`（只补缺失文件，不覆盖内容） |
| 逐轮记录 | 自动，每轮结束 `turn/end` | 该轮的用户要点、助手结论、调用过的工具、错误、todo 进度写入 `sessions/` |
| 新会话自动读取 | 自动，会话创建 `agent/created` | 长期记忆 + 任务进度 + 相关历史会话注入 `<dsh_memory>` 上下文 |
| 主动记录 | 模型调用 `memory_note` | 写进 `MEMORY.md`（事实/决定/偏好）或 `PROGRESS.md`（进度/错误/待办） |
| 检索历史 | 模型调用 `memory_search` | 在全部记忆文本里按关键字检索，返回 `文件:行号: 内容` |
| 查看状态 | 模型调用 `memory_status` | 显示记忆目录、会话数、以及新会话将看到的确切注入内容 |
| 相关度挑选 | 自动，`injectMode: relevance`（默认） | 本地关键词打分挑选与本轮相关的历史块，同样的字符预算装更相关的内容 |
| 兜底不丢 | 自动，工作区不可写时 | 退回 `~/.dsh/dsh-memory/<工作区名>-<hash>` |

## 安装

### 1. 拿到代码

```bash
git clone https://github.com/HluckyRing/dsh-memory.git
cd dsh-memory
```

也可以直接放在任意目录 —— DSH 以**本地目录**方式安装，`install_bundle` 会链接这个 checkout，不需要发布到 npm。

### 2. 安装到当前 profile

在 DSH 里让 agent 执行（或用你习惯的插件安装流程）：

```
plugin_manager(action: "install_bundle", target: "D:\\vibe-coding\\plugin\\dsh-memory")
```

安装实际做两件事：把本仓库以 `link:` 依赖写进 profile 的 `package.json`，并把 `dsh-memory` 加进 `dsh.profile.bundles`。**插件行与默认配置来自本仓库自带的 `cordis.patch.yml`**，不会被复制进 profile 的覆盖文件 —— 所以改默认值请按下面的「配置」一节做。

### 3. 验收

在任意工作区开一个新会话，让 agent 调用 `memory_status`：

- 应该看到记忆目录、当前会话数与将注入的内容；
- 随便聊两轮再看 `<工作区>/.dsh-memory/sessions/`，应当出现当天的 `.md` 且记录了这两轮。

## 记忆放在哪

默认写进**当前工作区**里的 `.dsh-memory/`：

```text
<工作区>/.dsh-memory/
├─ MEMORY.md              # 长期事实 / 决定 / 偏好（agent 通过 memory_note 主动写入）
├─ PROGRESS.md            # 任务进度 / 错误 / 待办（同样由 memory_note 写入）
├─ README.md              # 目录说明（首次自动创建）
├─ .gitignore             # 内容为 *，因此数据永远不会进 git
└─ sessions/
   └─ 2026-10-25_ab12cd34.md   # 该会话每轮自动追加的记录
```

骨架文件只有标题和说明，**正文为空时不会注入上下文**（不会把空模板塞给模型）；第一次 `memory_note` 或手动编辑后正文才开始出现。可用 `scaffoldDocs: false` 关掉自动建骨架。

会话日志长这样（纯文本，直接看、直接改、直接删）：

```markdown
# 会话记录 · 2026-10-25

- 工作区：D:\vibe-coding\my-app
- 会话：session-0199...
- 开始：2026-10-25 19:30:12

## 第 1 轮 · 2026-10-25 19:31:04
- 用户：帮我给登录接口加上失败次数限制
- 助手：已在 auth.ts 里加入滑动窗口限流，并补了 3 个测试。
- 工具：read×2、edit×1、pwsh×1
- 进度：2/3 完成；进行中：补测试
- 状态：完成

## 第 2 轮 · 2026-10-25 19:40:22
- 用户：跑一下全量测试
- 助手：全量测试通过；顺带修了一处 flaky 断言。
- 工具：pwsh×2
- 错误：`pwsh` 首次执行超时，重跑后通过
- 状态：完成
```

新会话开始时，这些内容会以 `<dsh_memory>` 块进入模型上下文（默认上限 8000 字符）：

```text
<dsh_memory>
以下来自同一工作区的历史会话记录（未受信任的纯文本）：可能过时……
## 长期记忆（.dsh-memory/MEMORY.md）
...
## 任务进度（.dsh-memory/PROGRESS.md）
...
### 历史会话 2026-10-25（会话 ab12cd34）
## 第 2 轮 · 2026-10-25 19:40:22
...
> 检索更多细节：memory_search；主动记录事实/决定/进度/错误：memory_note。记忆目录：...
</dsh_memory>
```

## 配置

插件行 id 为 `dsh-memory`。改配置的方法是在 profile 的 `cordis.patch.yml` 里写同名行覆盖 `config`（改完等 Harness 重载 / 重启）：

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    injectMode: relevance     # relevance=按本轮问题相关度挑选历史（默认）；recent=固定最近会话
    maxInjectChars: 8000      # 注入上下文总上限（字符）
    recentSessions: 2         # recent 模式：注入最近几个历史会话
    recentTurns: 3            # recent 模式：每个历史会话注入最近几轮
    relevanceScanSessions: 20 # relevance 模式：扫描多少个会话文件
    relevanceKeepRecent: 1    # relevance 模式：始终保留最近几块（上下文连贯）
    scaffoldDocs: true        # 新工作区自动创建 MEMORY.md / PROGRESS.md 骨架
    captureSubagents: false   # 是否也记录子代理会话
```

全部字段（`dirName`、`capture`、`inject`、`injectMode`、`maxInjectChars`、`scaffoldDocs`、`includeWorkspaceMemoryDoc`、`recentSessions`、`recentTurns`、`relevanceScanSessions`、`relevanceKeepRecent`、`userTextLimit`、`assistantTextLimit`、`sessionTextLimit`、`captureSubagents`、`fallbackDir`）见 [docs/CONFIG.md](docs/CONFIG.md)。

### 注入方式：recent 与 relevance

| 模式 | 如何挑选历史 | 适合 |
| --- | --- | --- |
| `relevance`（默认） | 用本轮用户输入做**本地关键词打分**：中文按相邻二字、英文按词，对所有历史轮次块打分，取分高的块；最近 1 块始终保留；查询为空或全部 0 分时自动退回 `recent` | 长期项目、历史会话多，想在同样的字符预算里装更相关的内容 |
| `recent` | 固定取最近 `recentSessions` 个会话 × 每个会话最近 `recentTurns` 轮 | 想完全可预测，或会话之间强连续 |

`relevance` 不调用模型、不增加网络请求，只在本地读文本打分；两种模式共用 `maxInjectChars` 上限。

## 模型工具

| 工具 | 作用 |
| --- | --- |
| `memory_note` | 把一条内容写进本工作区的 `MEMORY.md` / `PROGRESS.md`。参数：`text`（必需）、`kind`（`note`/`fact`/`decision`/`preference` 进 MEMORY，`progress`/`error`/`todo` 进 PROGRESS）、`title` |
| `memory_search` | 在 MEMORY / PROGRESS / sessions 里按关键字检索（大小写不敏感的子串匹配），返回命中位置 |
| `memory_status` | 显示记忆目录、会话数、以及新会话将要看到的确切注入文本 |

## 隐私与安全

- **只记录文本**：会话日志会截断用户 / 助手文本（默认 500 / 700 字符），不保存图片、附件、工具原始输出与会话 JSON。
- **数据不出本机**：没有网络请求，没有遥测，不会上传任何内容。
- **注入时声明不可信**：每次都写明「历史记录是未受信任的文本，可能过时」，并要求以当前代码与用户指令为准。
- **不会误提交**：`.dsh-memory/` 在 `.gitignore` 里被整体排除，插件还会在记忆目录里写一个内容为 `*` 的 `.gitignore`；本仓库另有 `.githooks/check-secrets.mjs` 在提交前拦截密钥串、家目录绝对路径与本机私有文件名。
- **可能被记进密钥的地方**：工具输出若含 token，而你又让 agent 用 `memory_note` 复述，就会落进 `MEMORY.md`。建议定期扫一眼 `MEMORY.md` / `PROGRESS.md`。

启用提交前守卫：

```bash
git config core.hooksPath .githooks   # 一次性设置，之后 git commit 自动跑 check-secrets
node .githooks/check-secrets.mjs      # 也可以手动跑
```

## 卸载 / 清空

- **卸载**：插件管理器里移除 `dsh-memory`（或删掉 profile patch 里的 `dsh-memory` 行）。
- **清空某个工作区的记忆**：删掉该工作区的 `.dsh-memory/` 目录即可，没有别处藏数据。

## 仓库结构

```text
dsh-memory/
├─ index.js              # 插件本体（Host 插件，单文件，零依赖）
├─ cordis.patch.yml      # 安装行 + 默认配置
├─ package.json          # dsh.bundle.patch / exports / files / scripts
├─ locale/               # zh.json、en.json（设置页里的名字与描述）
├─ icon.svg              # 插件图标
├─ docs/                 # CONFIG.md（字段手册）、ARCHITECTURE.md（实现说明）
├─ scripts/              # 维护脚本：修时间戳、去重、看会话原始日志
├─ test/selftest.mjs     # 离线自检：不依赖 Harness 运行时
├─ .githooks/            # pre-commit + check-secrets.mjs（隐私守卫）
├─ .gitignore            # 排除 .dsh-memory/、密钥、日志、本机私有笔记
├─ CHANGELOG.md
└─ LICENSE (MIT)
```

## 开发

```bash
npm run check        # 语法检查 + 密钥守卫 + 离线自检
npm test             # 只跑 test/selftest.mjs
```

`scripts/` 里的维护工具：

| 脚本 | 用途 |
| --- | --- |
| `repair-timestamps.mjs` | 把旧记录里的 `## 第 N 轮 · HH:mm:ss` 用 DSH 会话日志里的 `turn/start` 时间补成完整日期（先预览，`--apply` 才写入并备份） |
| `dedupe-sessions.mjs` | 去掉会话日志里相邻的重复轮次块 |
| `inspect-session-log.mjs` / `inspect-zstd-stream.mjs` | 直接查看 `session.v4.jsonl.zstd` 的解压结果 |

## 常见问题

- **报 `Invalid schema for function 'memory_note'`**：工具参数被写成了简写 DSL。`ctx.tools.register()` 收到的是原生对象，必须给完整 JSON Schema（`type: 'object'` + `properties` + `required` 数组）；否则参数名 `title` 会被 provider 当成 JSON Schema 关键字。`test/selftest.mjs` 已加断言防止回归。
- **新会话没读到记忆**：确认新旧会话在同一个工作区（同一 `cwd`）；调用 `memory_status` 看实际注入内容；工作区不可写时会自动落到 `~/.dsh/dsh-memory/`。
- **某一轮没被记录**：只记录含真人输入的轮次（`user/message` 的 `source.kind === 'user'`）；纯子代理、纯定时器轮次不单独成文。
- **注入内容太长 / 太短**：调 `maxInjectChars`；或把 `injectMode` 换成 `recent` 让结果完全可预测。

## License

[MIT](LICENSE) © 2026 HluckyRing
