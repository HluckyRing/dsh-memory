import { createReadStream } from 'node:fs'
import { createZstdDecompress } from 'node:zlib'
import { readFile } from 'node:fs/promises'

const file = process.argv[2]
const chunks = []
await new Promise((resolve, reject) => {
  const stream = createReadStream(file).pipe(createZstdDecompress())
  stream.on('data', (chunk) => chunks.push(chunk))
  stream.on('end', resolve)
  stream.on('error', reject)
})
const text = Buffer.concat(chunks).toString('utf8')
const lines = text.split('\n').filter((line) => line.trim() !== '')
let ok = 0
let bad = 0
const turns = []
for (const line of lines) {
  try {
    const event = JSON.parse(line)
    ok += 1
    if (event.type === 'turn/start' && typeof event.time === 'number') turns.push({ turn: event.data?.turn, time: new Date(event.time).toISOString() })
  } catch {
    bad += 1
  }
}
console.log(JSON.stringify({ bytes: text.length, lines: lines.length, ok, bad, turns: turns.slice(0, 5), turnCount: turns.length }, null, 2))

// 顺便看看投影缓存长什么样
const cacheFile = process.argv[3]
if (cacheFile) {
  const raw = await readFile(cacheFile, 'utf8')
  const json = JSON.parse(raw)
  console.log(JSON.stringify({ cacheKeys: Object.keys(json), cacheSize: raw.length, preview: JSON.stringify(json).slice(0, 300) }, null, 2))
}
