/**
 * 修复会话 Markdown 里的轮次时间：把 `## 第 N 轮 · HH:mm:ss` 补成完整日期时间。
 * 时间真值来自 DSH 的会话日志（turn/start 事件的 time），所以跨天会话也能修正。
 *
 * 用法：
 *   node test/repair-timestamps.mjs "D:\vibe-coding\plug"           # 只预览
 *   node test/repair-timestamps.mjs "D:\vibe-coding\plug" --apply   # 备份后写入
 */
import { readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const workspace = process.argv[2]
if (workspace === undefined) throw new Error('workspace directory argument is required')
const apply = process.argv.includes('--apply')
const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE ?? '', '.dsh')
const sessionsRoot = join(dshHome, 'sessions')

const pad = (n) => String(n).padStart(2, '0')
function fullStamp(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function findLog(sessionId) {
  let workspaceDirs
  try {
    workspaceDirs = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return null
  }
  for (const dir of workspaceDirs) {
    if (!dir.isDirectory()) continue
    const candidate = join(sessionsRoot, dir.name, sessionId)
    try {
      if (!(await stat(candidate)).isDirectory()) continue
    } catch {
      continue
    }
    const files = await readdir(candidate)
    const log = files.find((file) => file.endsWith('.jsonl.zstd')) ?? files.find((file) => file.endsWith('.jsonl'))
    if (log !== undefined) return join(candidate, log)
  }
  return null
}

/**
 * DSH 的会话日志是「多个 zstd 帧顺序拼接」的（每次 flush 追加一帧），
 * Node 的 zstdDecompressSync 只解第一帧，所以这里按 zstd 帧结构逐帧切分后再解压。
 * 帧格式：magic(4) + frame_header_descriptor(1) + [window] + [dictID] + [FCS] + blocks* + [checksum]
 */
function splitZstdFrames(buffer) {
  const magic = 0xfd2fb528
  const frames = []
  let offset = 0
  while (offset + 4 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== magic) return frames
    let cursor = offset + 4
    const descriptor = buffer[cursor]
    cursor += 1
    const fcsFlag = (descriptor >> 6) & 3
    const singleSegment = (descriptor >> 5) & 1
    const checksum = (descriptor >> 2) & 1
    const dictFlag = descriptor & 3
    if (!singleSegment) cursor += 1 // Window_Descriptor
    cursor += dictFlag === 3 ? 4 : dictFlag // Dictionary_ID
    if (fcsFlag === 0) cursor += singleSegment ? 1 : 0
    else if (fcsFlag === 1) cursor += 2
    else if (fcsFlag === 2) cursor += 4
    else cursor += 8
    let last = false
    while (!last) {
      if (cursor + 3 > buffer.length) return frames
      const header = buffer[cursor] | (buffer[cursor + 1] << 8) | (buffer[cursor + 2] << 16)
      cursor += 3
      last = (header & 1) === 1
      const blockType = (header >> 1) & 3
      const blockSize = header >>> 3
      if (blockType === 1) cursor += 1
      else if (blockType === 0 || blockType === 2) cursor += blockSize
      else return frames
    }
    if (checksum === 1) cursor += 4
    frames.push({ start: offset, end: cursor })
    offset = cursor
  }
  return frames
}

function decompressAll(raw) {
  const frames = splitZstdFrames(raw)
  if (frames.length === 0) return zstdDecompressSync(raw).toString('utf8')
  const parts = []
  for (const frame of frames) {
    try {
      parts.push(zstdDecompressSync(raw.subarray(frame.start, frame.end)).toString('utf8'))
    } catch {
      /* 单帧损坏就跳过，不影响其余帧 */
    }
  }
  return parts.join('')
}

async function readLog(path) {
  const raw = await readFile(path)
  return path.endsWith('.zstd') ? decompressAll(raw) : raw.toString('utf8')
}

function turnTimes(text) {
  const map = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let event
    try {
      event = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (event?.type === 'turn/start' && typeof event.data?.turn === 'number' && typeof event.time === 'number') {
      if (!map.has(event.data.turn)) map.set(event.data.turn, event.time)
    }
  }
  return map
}

const sessionsDir = join(workspace, '.dsh-memory', 'sessions')
let files
try {
  files = (await readdir(sessionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(sessionsDir, entry.name))
} catch {
  console.log(JSON.stringify({ workspace, error: 'no .dsh-memory/sessions directory' }, null, 2))
  process.exit(1)
}

const report = []
for (const file of files) {
  const text = await readFile(file, 'utf8')
  const sessionMatch = /^- 会话：(\S+)\s*$/mu.exec(text)
  if (sessionMatch === null) {
    report.push({ file, skipped: 'session id not found in header' })
    continue
  }
  const sessionId = sessionMatch[1]
  const log = await findLog(sessionId)
  if (log === null) {
    report.push({ file, sessionId, skipped: 'session log not found' })
    continue
  }
  const map = turnTimes(await readLog(log))
  let changed = 0
  let missing = 0
  let mismatched = 0
  const next = text.replace(/^## 第 (\d+) 轮 · (\d{2}):(\d{2}):(\d{2})$/gmu, (whole, turnText, h, m, s) => {
    const turn = Number(turnText)
    const time = map.get(turn)
    if (time === undefined) {
      missing += 1
      return whole
    }
    const stamp = fullStamp(time)
    if (stamp.slice(11) !== `${h}:${m}:${s}`) mismatched += 1
    changed += 1
    return `## 第 ${turn} 轮 · ${stamp}`
  })
  report.push({ file, sessionId, turnsInLog: map.size, changed, missing, mismatched })
  if (apply && changed > 0) {
    const backup = `${file}.bak-timestamps-${new Date().toISOString().replace(/[:.]/gu, '-')}`
    await copyFile(file, backup)
    await writeFile(file, next, 'utf8')
  }
}

console.log(JSON.stringify({ workspace, apply, report }, null, 2))
