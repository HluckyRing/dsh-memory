# 配置手册 · dsh-memory

插件行 id 是 `dsh-memory`。所有字段都是可选的，缺省值来自 `cordis.patch.yml`。

## 怎么改

**不要**改本仓库的 `cordis.patch.yml`（那是默认值，升级会被覆盖）。在 profile 的 `cordis.patch.yml` 里写一条**同名行**覆盖 `config` 即可：

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    maxInjectChars: 12000
    injectMode: recent
```

- 文件位置：`<DSH_HOME>/profiles/<profile>/cordis.patch.yml`（Windows 默认 `C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml`）。
- 改完需要重载 / 重启 Harness 才会生效。
- 只覆盖想改的字段，其余沿用默认值。

## 字段

| 字段 | 类型 | 默认 | 取值范围 | 说明 |
| --- | --- | --- | --- | --- |
| `dirName` | string | `.dsh-memory` | 工作区内相对路径（可含子目录） | 记忆目录名，相对工作区根。绝对路径、盘符或含 `..` 的逃逸写法会被忽略并回退默认值。一般不需要改 |
| `capture` | boolean | `true` | — | 是否逐轮自动记录。关掉后只剩工具与注入 |
| `inject` | boolean | `true` | — | 是否把记忆注入会话上下文。关掉后只写不读 |
| `captureSubagents` | boolean | `false` | — | 是否也把子代理会话单独记成文件（默认关，避免噪音） |
| `injectSubagents` | boolean | `false` | — | 是否也向子代理会话注入记忆上下文（默认关，省 token；子代理默认也不记录） |
| `scaffoldDocs` | boolean | `true` | — | 新工作区自动创建 `MEMORY.md` / `PROGRESS.md` 骨架（只补缺失文件，绝不覆盖已有内容） |
| `includeWorkspaceMemoryDoc` | boolean | `true` | — | 是否把工作区根目录既有的 `MEMORY.md` 一并注入（给已经有自己约定的项目用） |
| `injectMode` | string | `relevance` | `relevance` \| `recent` | 历史挑选策略：按本轮问题打分，或固定取最近会话 |
| `maxInjectChars` | number | `8000` | 1000–60000 | 注入内容总上限（字符）。超出部分按顺序截断并提示可用 `memory_search` 检索 |
| `recentSessions` | number | `2` | 0–10 | `recent` 模式：注入最近几个历史会话 |
| `recentTurns` | number | `3` | 1–10 | `recent` 模式：每个历史会话注入最近几轮 |
| `relevanceScanSessions` | number | `20` | 1–200 | `relevance` 模式：最多扫描多少个会话文件 |
| `relevanceKeepRecent` | number | `1` | 0–5 | `relevance` 模式：无条件保留的最近轮次块数量，保证上下文连贯 |
| `relevanceHalfLifeDays` | number | `30` | 0–3650 | `relevance` 打分的时间衰减半衰期（天）；`0` = 不衰减。老块权重 = 命中数 × 0.5^(年龄天数 / 半衰期) |
| `injectRefresh` | string | `turn` | `turn` \| `session` | 注入刷新时机：`turn` 每轮重建（相关度跟随本轮问题）；`session` 会话开始构建一次（省重算、利于 prompt 前缀缓存，但相关度不随本轮问题变化） |
| `userTextLimit` | number | `500` | 80–4000 | 单条用户文本记录上限（字符） |
| `assistantTextLimit` | number | `700` | 80–8000 | 单条助手文本记录上限（字符） |
| `sessionTextLimit` | number | `900` | 120–8000 | 注入时每个历史会话块的上限（字符） |
| `fallbackDir` | string | `''` | 绝对路径或空 | 工作区不可写时的备用目录；留空 = `~/.dsh/dsh-memory/<工作区名>-<hash>` |

数值字段会被夹在给定区间内（`clampInt`），非法值回退默认值，不会让插件起不来。

## 注入截断策略

- `MEMORY.md` 与工作区根 `MEMORY.md` 超过上限时保留**开头 + 最新部分**（中间省略处带 `…（中间内容已省略，完整内容可用 memory_search 检索）…` 标记）；`PROGRESS.md` 是追加日志，只保留**最新部分**。
- 历史轮次块超过 `sessionTextLimit` 时保留**两端**：轮次标题 + 用户要点，以及助手结论 / 错误 / 状态。
- 被省略的内容仍可用 `memory_search` 检索原始文件；注入块内来自文件的 `<dsh_memory>` / `</dsh_memory>` 会被转义成 HTML 实体，不能伪造块边界。

## 典型组合

### 1. 长项目，历史很多

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    injectMode: relevance
    relevanceScanSessions: 50
    maxInjectChars: 12000
```

同样的字符预算装更相关的历史；扫描 50 个会话文件仍是纯本地读文本，开销可以忽略。

### 2. 会话之间强连续，想完全可预测

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    injectMode: recent
    recentSessions: 3
    recentTurns: 5
```

### 3. 只记录不注入（当审计日志用）

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    inject: false
```

### 4. 关掉自动记录，只用 `memory_note` 手动记

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    capture: false
    scaffoldDocs: true
```

### 5. 记忆放到工作区之外

```yaml
- id: dsh-memory
  name: dsh-memory
  config:
    fallbackDir: 'D:\dsh-memory-store'
```

## 记忆目录的文件约定

| 文件 | 内容 | 谁写 |
| --- | --- | --- |
| `MEMORY.md` | 长期事实 / 决定 / 偏好 | `memory_note`（`kind` = note/fact/decision/preference）或人手改 |
| `PROGRESS.md` | 任务进度 / 错误 / 待办 | `memory_note`（`kind` = progress/error/todo）或人手改 |
| `index.md` | 会话索引（日期 + 会话短 id + 首条用户输入摘要） | 插件自动维护；老工作区首次加载时自动回填（最多 200 个旧会话） |
| `sessions/<日期>_<会话id>.md` | 每轮记录 | 插件自动 |
| `README.md` | 目录说明 | 首次自动创建 |
| `.gitignore` | 内容为 `*` | 首次自动创建，保证数据不进 git |

`memory_note` 单条文本上限为 2000 字符，超出会截断并在工具返回值里标记 `truncated: true`，避免一条超长 note 长期占满注入预算。fallback 目录同样会写 `.gitignore`（内容 `*`）与 `README.md`；工具与检索结果里的路径在工作区内是相对路径（`.dsh-memory/...`），在 fallback 目录下则返回绝对路径。

只有 Markdown 正文（去掉 `#` 标题行与 `>` 说明行后仍非空）才会被注入；空的骨架模板不会占上下文。

## 隐私相关

- 记录内容只截断文本，不含图片、附件、工具原始输出与会话 JSON。
- 记忆目录整体在仓库 `.gitignore` 里（`.dsh-memory/`），插件自己也会写 `.gitignore = *`。
- 提交前的密钥守卫：`node .githooks/check-secrets.mjs`（`git config core.hooksPath .githooks` 后自动生效）。
