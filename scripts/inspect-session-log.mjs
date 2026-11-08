import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
const raw = await readFile(file)
let text
try {
  text = zstdDecompressSync(raw).toString('utf8')
} catch (error) {
  console.log(JSON.stringify({ error: String(error), rawBytes: raw.length }, null, 2))
  process.exit(1)
}
const lines = text.split('\n')
let ok = 0
let bad = 0
const samples = []
for (const line of lines) {
  const s = line.trim()
  if (s === '') continue
  try {
    const event = JSON.parse(s)
    ok += 1
    if (samples.length < 3) samples.push({ keys: Object.keys(event), type: event.type, time: event.time, dataKeys: event.data ? Object.keys(event.data) : null })
  } catch {
    bad += 1
    if (samples.length < 6) samples.push({ unparsed: s.slice(0, 120) })
  }
}
console.log(JSON.stringify({ rawBytes: raw.length, textBytes: text.length, lines: lines.length, ok, bad, samples }, null, 2))
