/**
 * 密钥 / 私有信息守卫（仓库内版本化）。
 *
 * 由同目录的 `pre-commit` 调用，也可单独运行：
 *
 *     node .githooks/check-secrets.mjs        # 退出码 0 = 干净，1 = 命中
 *
 * 拦三类东西：
 *   1) 文件名本身属于密钥 / 私有文件（.env、*.local.md、.dsh-memory/ 等）
 *   2) 文件内容里出现「真实形态」的密钥串（前缀 + 足够长的随机串）
 *   3) **本机个人信息**：当前用户的家目录路径、`Users/<用户名>` 片段
 *
 * 第 3 条是本仓库作为公开仓库的额外防线：DSH 的会话记录、路径、配置里很容易
 * 带上 `C:\Users\<你>` 这种绝对路径，一旦推上 GitHub 就无法收回。规则在运行时
 * 从 `os.homedir()` / `os.userInfo()` 现算，脚本本身不含任何个人信息。
 *
 * 设计要点：
 *   - 仓库根由脚本自身位置推断（`.githooks/` → 上一层），不依赖 cwd；
 *   - 不建管道：git 输出先写临时文件再读回，这样在 DSH agent 沙箱里也能跑；
 *   - 守卫自身出错绝不阻断提交（拿不到暂存清单就放行）。
 */
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** 由脚本位置推断仓库根；推不出来就退回 cwd。 */
function detectRepo() {
  const candidates = []
  const name = basename(here)
  if (name === 'hooks') candidates.push(dirname(dirname(here))) // <repo>/.git/hooks
  if (name === '.githooks') candidates.push(dirname(here)) // <repo>/.githooks
  candidates.push(process.cwd())
  for (const dir of candidates) {
    if (existsSync(join(dir, '.git'))) return dir
  }
  return process.cwd()
}

const REPO = detectRepo()
const work = mkdtempSync(join(tmpdir(), 'dsh-precommit-'))

/** 在目标仓库里跑一次 git，stdout 落临时文件后读回来（不建管道）。 */
function git(args) {
  const out = join(work, 'stdout')
  const fd = openSync(out, 'w')
  try {
    execFileSync('git', ['-C', REPO, ...args], { stdio: ['ignore', fd, 'inherit'] })
  } finally {
    closeSync(fd)
  }
  return readFileSync(out, 'utf8')
}

/** 文件名规则：一律不应入库。 */
const NAME_RULES = [
  [/(^|\/)\.env([^/]*)$/, '.env / .env.*'],
  [/(^|\/)[^/]*\.env$/, '*.env'],
  [/(^|\/)[^/]*\.local$/, '*.local'],
  [/(^|\/)[^/]*\.local\.md$/, '*.local.md（DSH 私有叠加层）'],
  [/(^|\/)\.dsh-memory(\/|$)/, '.dsh-memory/（跨会话记忆，含私人对话摘要）'],
  [/(^|\/)(MEMORY|PROGRESS)\.md$/, 'MEMORY.md / PROGRESS.md（工作区私人记忆）'],
]

/** 内容规则：前缀后必须跟足够长的随机串，避免误伤文档。 */
const SECRET_RULES = [
  ['DeepSeek/OpenAI 风格 key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['GitHub PAT', /\bghp_[A-Za-z0-9]{20,}/],
  ['GitHub 细粒度 PAT', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['AWS Access Key ID', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['私钥文件', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

/** 本机个人信息规则（运行时现算，脚本里不写死用户名）。 */
function personalRules() {
  const rules = []
  const home = homedir()
  if (typeof home === 'string' && home.length > 3) {
    const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rules.push(['本机家目录绝对路径', new RegExp(escaped, 'i')])
    // Windows: C:\Users\<name>  /  POSIX: /home/<name>
    const parts = home.split(/[\\/]+/).filter(Boolean)
    const user = parts[parts.length - 1]
    if (user && user.length >= 2 && !['home', 'Users', 'root'].includes(user)) {
      const escapedUser = user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      rules.push(['本机用户名路径片段', new RegExp(`(Users|home)[\\\\/]${escapedUser}(?![A-Za-z0-9])`, 'i')])
    }
  }
  try {
    const name = userInfo().username
    if (typeof name === 'string' && name.length >= 3) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      rules.push(['本机用户名', new RegExp(`(Users|home)[\\\\/]${escaped}(?![A-Za-z0-9])`, 'i')])
    }
  } catch {
    // 某些沙箱里 userInfo 会抛，忽略即可。
  }
  return rules
}

const PERSONAL_RULES = personalRules()
const nameHits = []
const secretHits = []
const personalHits = []

let staged = []
try {
  staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split('\n')
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter(Boolean)
} catch {
  rmSync(work, { recursive: true, force: true })
  process.exit(0) // 拿不到暂存清单就不阻断
}

for (const file of staged) {
  for (const [re, label] of NAME_RULES) {
    if (re.test(file)) {
      nameHits.push(`    ${file}  ← 命中文件规则 ${label}`)
      break
    }
  }

  let content
  try {
    content = git(['show', `:${file}`])
  } catch {
    continue // 读不到就跳过，守卫自身出错不应阻断提交
  }
  for (const [label, re] of SECRET_RULES) {
    const match = content.match(re)
    if (match) {
      secretHits.push(`    ${file}  ← 疑似 ${label}：${match[0].slice(0, 12)}…`)
      break
    }
  }
  for (const [label, re] of PERSONAL_RULES) {
    const match = content.match(re)
    if (match) {
      personalHits.push(`    ${file}  ← 命中个人信息：${label}`)
      break
    }
  }
}

rmSync(work, { recursive: true, force: true })

let failed = false

if (nameHits.length) {
  failed = true
  console.error(`✗ 已阻止提交：检测到密钥/私有类文件被暂存（仓库：${REPO}）`)
  console.error(nameHits.join('\n'))
  console.error('  这些文件不应入库。强制添加过的请先取消暂存：git restore --staged <file>')
}

if (secretHits.length) {
  failed = true
  console.error(`✗ 已阻止提交：暂存内容里出现疑似真实密钥（仓库：${REPO}）`)
  console.error(secretHits.join('\n'))
  console.error('  请改用环境变量或凭据服务；确属误报可 git commit --no-verify 跳过')
}

if (personalHits.length) {
  failed = true
  console.error(`✗ 已阻止提交：暂存内容里出现本机个人信息（仓库：${REPO}）`)
  console.error(personalHits.join('\n'))
  console.error('  公开仓库不应带上本机用户名/家目录路径，请替换为占位符（如 <YOUR_PATH>）')
}

if (!failed && process.env.PRECOMMIT_VERBOSE === '1') {
  console.error(`✓ 密钥守卫通过（仓库：${REPO}${sep}，暂存 ${staged.length} 个文件）`)
}

process.exit(failed ? 1 : 0)
