import { AppError } from '../shared/errors/app-error'

/** 长文章分段的安全阈值与上限，集中配置，避免散落魔法数字。 */
export interface ChunkLimits {
  /** 单段最大字符数，超过时按 Markdown 结构切分。 */
  maxCharsPerChunk: number
  /** 允许的最大分段数，超过则视为内容过长。 */
  maxChunks: number
}

export const DEFAULT_CHUNK_LIMITS: ChunkLimits = {
  maxCharsPerChunk: 8000,
  maxChunks: 30,
}

/** 输入是否超过安全阈值，需要分段。 */
export function shouldChunk(markdown: string, limits: ChunkLimits): boolean {
  return markdown.length > limits.maxCharsPerChunk
}

const BLANK_LINE = /^\s*$/
const ATX_HEADING = /^\s{0,3}#{1,6}\s/
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/
const LIST_MARKER = /^(\s*)([-*+]|\d+[.)])\s+/
const INDENTED = /^( {2,}|\t)/
const IMAGE_LINE = /^\s*!\[[^\]]*\]\(.*\)\s*$/

function isBlank(line: string): boolean {
  return BLANK_LINE.test(line)
}

interface FenceInfo {
  char: string
  length: number
}

function matchFence(line: string): FenceInfo | null {
  const match = FENCE_OPEN.exec(line)
  if (!match) {
    return null
  }
  const fence = match[1]
  return { char: fence[0], length: fence.length }
}

function isHeading(line: string): boolean {
  return ATX_HEADING.test(line)
}

function isListMarker(line: string): boolean {
  return LIST_MARKER.test(line)
}

function isIndented(line: string): boolean {
  return INDENTED.test(line)
}

/** 块是否仅由图片 Markdown 组成，用于图片与相邻段落的合并策略。 */
function isImageOnlyBlock(block: string): boolean {
  const lines = block.split('\n').filter((line) => !isBlank(line))
  return lines.length > 0 && lines.every((line) => IMAGE_LINE.test(line.trim()))
}

/**
 * 将 Markdown 拆分为不可再切分的原子块：
 * 完整代码围栏、标题、完整列表组与普通段落，绝不按任意字符截断。
 */
function splitIntoBlocks(markdown: string): string[] {
  const lines = markdown.split('\n')
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (isBlank(line)) {
      index += 1
      continue
    }

    const fence = matchFence(line)
    if (fence) {
      const start = index
      index += 1
      while (index < lines.length) {
        const close = matchFence(lines[index])
        if (close && close.char === fence.char && close.length >= fence.length) {
          index += 1
          break
        }
        index += 1
      }
      blocks.push(lines.slice(start, index).join('\n'))
      continue
    }

    if (isHeading(line)) {
      blocks.push(line)
      index += 1
      continue
    }

    if (isListMarker(line)) {
      const start = index
      index += 1
      while (index < lines.length) {
        const current = lines[index]
        if (isBlank(current)) {
          let next = index
          while (next < lines.length && isBlank(lines[next])) {
            next += 1
          }
          if (next < lines.length && (isListMarker(lines[next]) || isIndented(lines[next]))) {
            index = next
            continue
          }
          break
        }
        if (isListMarker(current) || isIndented(current)) {
          index += 1
        } else {
          break
        }
      }
      blocks.push(lines.slice(start, index).join('\n'))
      continue
    }

    const start = index
    index += 1
    while (
      index < lines.length &&
      !isBlank(lines[index]) &&
      !matchFence(lines[index]) &&
      !isHeading(lines[index]) &&
      !isListMarker(lines[index])
    ) {
      index += 1
    }
    blocks.push(lines.slice(start, index).join('\n'))
  }

  return blocks
}

/**
 * 按 Markdown 结构切分出不超过阈值的分段。
 * 图片块尽量与相邻段落同段；单个原子块超过阈值时保持完整不硬切。
 * 分段数超过 maxChunks 时抛出 CONTENT_TOO_LONG。
 */
export function splitMarkdownChunks(markdown: string, limits: ChunkLimits): string[] {
  const blocks = splitIntoBlocks(markdown)
  const chunks: string[] = []
  let current: string[] = []
  let currentLength = 0

  const flush = () => {
    chunks.push(current.join('\n\n'))
    current = []
    currentLength = 0
  }

  for (const block of blocks) {
    const previous = current[current.length - 1]
    const wouldOverflow =
      current.length > 0 && currentLength + 2 + block.length > limits.maxCharsPerChunk
    const keepWithPrevious =
      !wouldOverflow || isImageOnlyBlock(block) || (previous !== undefined && isImageOnlyBlock(previous))

    if (current.length > 0 && !keepWithPrevious) {
      flush()
    }

    currentLength += (current.length > 0 ? 2 : 0) + block.length
    current.push(block)
  }

  if (current.length > 0) {
    flush()
  }

  if (chunks.length > limits.maxChunks) {
    throw new AppError('CONTENT_TOO_LONG', '文章超过当前支持的翻译长度限制。')
  }

  return chunks
}