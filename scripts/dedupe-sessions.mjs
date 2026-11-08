// 一次性清理：去掉会话日志里相邻的重复轮次块（插件双实例期间产生）。
import { readFile, writeFile, copyFile } from 'node:fs/promises'

const file = process.argv[2]
const text = await readFile(file, 'utf8')
const parts = text.split(/\n(?=## 第 )/u)
const header = parts.shift() ?? ''
const blocks = []
for (const block of parts) {
  const previous = blocks[blocks.length - 1]
  if (previous !== undefined && previous.trim() === block.trim()) continue
  blocks.push(block)
}
if (blocks.length === parts.length) {
  console.log('NO_DUPLICATES')
} else {
  await copyFile(file, `${file}.bak`)
  await writeFile(file, `${header}\n${blocks.join('\n')}`, 'utf8')
  console.log(`REMOVED ${parts.length - blocks.length} DUPLICATE BLOCK(S): ${parts.length} -> ${blocks.length}`)
}
