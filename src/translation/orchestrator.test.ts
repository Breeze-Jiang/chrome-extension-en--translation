import { describe, expect, it, vi } from 'vitest'

import type { ExtractedArticle } from '../shared/contracts/article'
import type { ModelSettings } from '../shared/contracts/settings'
import type { TranslationResult } from '../shared/contracts/translation'
import { AppError } from '../shared/errors/app-error'
import type { TranslationProvider } from './providers/translation-provider'
import { TranslationOrchestrator } from './orchestrator'

const article: ExtractedArticle = {
  version: 1,
  url: 'https://example.com/article',
  title: 'Article',
  author: '',
  language: 'en',
  siteName: 'Example',
  markdown: 'Body',
  charCount: 4,
  extractor: 'defuddle',
  qualityScore: 90,
  extractedAt: '2026-08-21T10:00:00.000Z',
}
const settings: ModelSettings = {
  version: 1,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'test-key',
  model: 'qwen-plus',
}
const translatedOutput = '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n正文'

function providerFrom(chunks: string[]): TranslationProvider {
  return {
    async *translate() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function successfulSave(
  implementation?: (result: TranslationResult, shouldCommit: () => boolean) => void,
) {
  return vi.fn<(
    result: TranslationResult,
    shouldCommit: () => boolean,
    onCommit: () => void,
  ) => Promise<void>>().mockImplementation(async (result, shouldCommit, onCommit) => {
    implementation?.(result, shouldCommit)
    onCommit()
  })
}

describe('TranslationOrchestrator', () => {
  it('按到达顺序拼接单一缓冲区并返回完整校验结果', async () => {
    const snapshots: string[] = []
    const provider = providerFrom([
      '# 文章\n\n> **作者**：',
      '（无）\n> **原文链接**：https://example.com/article\n\n',
      '正文',
    ])
    const saveResult = successfulSave()
    const orchestrator = new TranslationOrchestrator(provider, saveResult)

    const result = await orchestrator.translate({
      article,
      settings,
      signal: new AbortController().signal,
      onSnapshot: (markdown) => snapshots.push(markdown),
    })

    expect(snapshots).toEqual([
      '# 文章\n\n> **作者**：',
      '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n',
      '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n正文',
    ])
    expect(result).not.toBeNull()
    expect(result?.title).toBe('文章')
    expect(result?.markdown).toBe(snapshots.at(-1))
  })

  it('仅在完整流结束且输出校验通过后保存结果', async () => {
    const saveResult = successfulSave()
    const orchestrator = new TranslationOrchestrator(providerFrom([
      '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n正文',
    ]), saveResult)

    const result = await orchestrator.translate({
      article,
      settings,
      signal: new AbortController().signal,
      onSnapshot: vi.fn(),
    })

    expect(saveResult).toHaveBeenCalledTimes(1)
    expect(saveResult).toHaveBeenCalledWith(
      result,
      expect.any(Function),
      expect.any(Function),
    )
    expect(saveResult.mock.calls[0]?.[1]()).toBe(true)
    expect(result).toMatchObject({
      version: 1,
      sourceUrl: article.url,
      title: '文章',
      author: article.author,
      markdown: expect.stringContaining('正文'),
      model: settings.model,
    })
  })

  it('非法输出和流中断不会保存或覆盖旧结果', async () => {
    const saveResult = vi.fn<(result: TranslationResult) => Promise<void>>().mockResolvedValue(undefined)
    const invalid = new TranslationOrchestrator(providerFrom(['# 缺少元数据\n\n正文']), saveResult)

    await expect(invalid.translate({
      article,
      settings,
      signal: new AbortController().signal,
      onSnapshot: vi.fn(),
    })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })

    const interrupted = new TranslationOrchestrator({
      async *translate() {
        yield '# 文章'
        throw new AppError('STREAM_INTERRUPTED', '流中断')
      },
    }, saveResult)
    await expect(interrupted.translate({
      article,
      settings,
      signal: new AbortController().signal,
      onSnapshot: vi.fn(),
    })).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })
    expect(saveResult).not.toHaveBeenCalled()
  })

  it('持久化收到最小提交条件，中止后条件失效', async () => {
    const controller = new AbortController()
    let shouldCommit!: () => boolean
    const saveResult = successfulSave((_result, condition) => { shouldCommit = condition })
    const orchestrator = new TranslationOrchestrator(providerFrom([translatedOutput]), saveResult)

    const result = await orchestrator.translate({
      article,
      settings,
      signal: controller.signal,
      onSnapshot: vi.fn(),
    })

    expect(saveResult).toHaveBeenCalledTimes(1)
    expect(shouldCommit()).toBe(true)
    controller.abort()
    expect(shouldCommit()).toBe(false)
    expect(result).not.toBeNull()
  })

  it('取消后不再发布增量，也不产生完成结果或写入', async () => {
    const controller = new AbortController()
    const onSnapshot = vi.fn()
    const provider: TranslationProvider = {
      async *translate() {
        yield '# 文章'
        controller.abort()
        yield '\n\n不应出现'
      },
    }
    const saveResult = vi.fn<(result: TranslationResult) => Promise<void>>()
    const orchestrator = new TranslationOrchestrator(provider, saveResult)

    const result = await orchestrator.translate({
      article,
      settings,
      signal: controller.signal,
      onSnapshot,
    })

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBeNull()
    expect(saveResult).not.toHaveBeenCalled()
  })

  it('取消后 Provider 抛错仍视为取消，不保存不抛出', async () => {
    const controller = new AbortController()
    const onSnapshot = vi.fn()
    const provider: TranslationProvider = {
      async *translate() {
        yield '# 文章'
        controller.abort()
        throw new AppError('STREAM_INTERRUPTED', '流中断')
      },
    }
    const saveResult = vi.fn<(result: TranslationResult) => Promise<void>>()
    const orchestrator = new TranslationOrchestrator(provider, saveResult)

    const result = await orchestrator.translate({
      article,
      settings,
      signal: controller.signal,
      onSnapshot,
    })

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBeNull()
    expect(saveResult).not.toHaveBeenCalled()
  })

  it('长文章按序串行分段翻译，标题与元数据只出现一次', async () => {
    const longArticle: ExtractedArticle = {
      ...article,
      markdown: '## First\n\nBody one.\n\n## Second\n\nBody two.',
    }
    const firstPart = '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n## 第一部分\n\n正文一。'
    const secondPart = '## 第二部分\n\n正文二。'
    let calls = 0
    const provider: TranslationProvider = {
      async *translate() {
        calls += 1
        yield calls === 1 ? firstPart : secondPart
      },
    }
    const saveResult = successfulSave()
    const orchestrator = new TranslationOrchestrator(provider, saveResult)

    const result = await orchestrator.translate({
      article: longArticle,
      settings,
      signal: new AbortController().signal,
      onSnapshot: vi.fn(),
      chunkLimits: { maxCharsPerChunk: 30, maxChunks: 10 },
    })

    expect(calls).toBe(2)
    expect(result).toMatchObject({ title: '文章' })
    const markdown = result?.markdown ?? ''
    expect(markdown.indexOf('## 第一部分')).toBeGreaterThanOrEqual(0)
    expect(markdown.indexOf('## 第一部分')).toBeLessThan(markdown.indexOf('## 第二部分'))
    expect(markdown.split('> **原文链接**：https://example.com/article').length - 1).toBe(1)
    expect(markdown.split('> **作者**：（无）').length - 1).toBe(1)
    expect(saveResult).toHaveBeenCalledTimes(1)
  })

  it('中间分段失败时不保存部分结果', async () => {
    const longArticle: ExtractedArticle = {
      ...article,
      markdown: '## First\n\nBody one.\n\n## Second\n\nBody two.',
    }
    let calls = 0
    const provider: TranslationProvider = {
      async *translate() {
        calls += 1
        if (calls === 1) {
          yield '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n正文一'
          return
        }
        throw new AppError('STREAM_INTERRUPTED', '中断')
      },
    }
    const saveResult = vi.fn<(result: TranslationResult) => Promise<void>>().mockResolvedValue(undefined)
    const orchestrator = new TranslationOrchestrator(provider, saveResult)

    await expect(orchestrator.translate({
      article: longArticle,
      settings,
      signal: new AbortController().signal,
      onSnapshot: vi.fn(),
      chunkLimits: { maxCharsPerChunk: 30, maxChunks: 10 },
    })).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })

    expect(calls).toBe(2)
    expect(saveResult).not.toHaveBeenCalled()
  })
})
