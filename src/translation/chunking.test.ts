import { describe, expect, it } from 'vitest'

import { isAppError } from '../shared/errors/app-error'
import {
  DEFAULT_CHUNK_LIMITS,
  shouldChunk,
  splitMarkdownChunks,
} from './chunking'

describe('shouldChunk', () => {
  it('仅在超过安全阈值时返回 true', () => {
    const limits = { maxCharsPerChunk: 20, maxChunks: 5 }
    expect(shouldChunk('a'.repeat(20), limits)).toBe(false)
    expect(shouldChunk('a'.repeat(21), limits)).toBe(true)
  })
})

describe('splitMarkdownChunks', () => {
  it('空内容返回空数组', () => {
    expect(splitMarkdownChunks('', { maxCharsPerChunk: 100, maxChunks: 5 })).toEqual([])
  })

  it('以二级标题为边界切分', () => {
    const markdown = [
      '## Intro',
      '',
      'a'.repeat(100),
      '',
      '## Detail',
      '',
      'b'.repeat(100),
    ].join('\n')

    const chunks = splitMarkdownChunks(markdown, { maxCharsPerChunk: 120, maxChunks: 10 })

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('## Intro')
    expect(chunks[0]).toContain('a'.repeat(100))
    expect(chunks[1]).toContain('## Detail')
    expect(chunks[1]).toContain('b'.repeat(100))
  })

  it('不切断代码围栏，完整代码块落在同一段', () => {
    const code = '```js\n' + 'x'.repeat(500) + '\n```'
    const markdown = ['## Intro', '', 'Here is code:', '', code, '', 'After.'].join('\n')

    const chunks = splitMarkdownChunks(markdown, { maxCharsPerChunk: 120, maxChunks: 10 })

    const withCode = chunks.filter((chunk) => chunk.includes('```js'))
    expect(withCode).toHaveLength(1)
    expect(withCode[0]).toContain('x'.repeat(500))
  })

  it('不切断列表，完整列表落在同一段', () => {
    const list = ['- alpha one', '- beta two', '- gamma three'].join('\n')
    const markdown = ['## List', '', list].join('\n')

    const chunks = splitMarkdownChunks(markdown, { maxCharsPerChunk: 25, maxChunks: 10 })

    const withList = chunks.filter((chunk) => chunk.includes('- alpha'))
    expect(withList).toHaveLength(1)
    expect(withList[0]).toContain('- gamma')
  })

  it('图片尽量与相邻段落处于同一段', () => {
    const markdown = [
      'A'.repeat(100),
      '',
      '![diagram](https://example.com/a.png)',
      '',
      'B'.repeat(100),
      '',
      'C'.repeat(100),
    ].join('\n')

    const chunks = splitMarkdownChunks(markdown, { maxCharsPerChunk: 150, maxChunks: 10 })

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('![diagram]')
    expect(chunks[0]).toContain('B'.repeat(100))
  })

  it('分段数超过 maxChunks 时抛出 CONTENT_TOO_LONG', () => {
    const markdown = Array.from({ length: 5 }, (_, i) => `## Section ${i}`).join('\n\n')

    const error = (() => {
      try {
        splitMarkdownChunks(markdown, { maxCharsPerChunk: 20, maxChunks: 3 })
      } catch (caught: unknown) {
        return caught
      }
      return null
    })()

    expect(isAppError(error)).toBe(true)
    if (isAppError(error)) {
      expect(error.code).toBe('CONTENT_TOO_LONG')
    }
  })

  it('默认阈值与最大分段数大于零', () => {
    expect(DEFAULT_CHUNK_LIMITS.maxCharsPerChunk).toBeGreaterThan(0)
    expect(DEFAULT_CHUNK_LIMITS.maxChunks).toBeGreaterThan(0)
  })
})