import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ExtractedArticle } from '../../shared/contracts/article'
import type { ModelSettings } from '../../shared/contracts/settings'
import type { TranslationResult } from '../../shared/contracts/translation'
import { AppError } from '../../shared/errors/app-error'
import { RESULT_STORAGE_KEY, saveResult } from '../../storage/result-repository'
import type { TranslationProvider } from '../../translation/providers/translation-provider'
import {
  useTranslationSession,
  type TranslationSessionDependencies,
} from './use-translation-session'

const article: ExtractedArticle = {
  version: 1,
  url: 'https://example.com/article',
  title: 'Article',
  author: '',
  language: 'en',
  siteName: 'Example',
  markdown: '# Article\n\nBody',
  charCount: 12,
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
const translated = '# 文章\n\n> **作者**：（无）\n> **原文链接**：https://example.com/article\n\n正文'
const storedResult: TranslationResult = {
  version: 1,
  sourceUrl: article.url,
  title: '旧文章',
  author: '',
  markdown: '# 旧文章\n\n旧正文',
  completedAt: '2026-08-20T10:00:00.000Z',
  model: 'qwen-plus',
}

function makeDependencies(provider?: TranslationProvider): TranslationSessionDependencies {
  return {
    readSettings: vi.fn().mockResolvedValue(settings),
    readResult: vi.fn().mockResolvedValue(null),
    saveResult: vi.fn().mockImplementation(async (_result, _shouldCommit, onCommit) => {
      onCommit()
    }),
    extractArticle: vi.fn().mockResolvedValue(article),
    openSettings: vi.fn().mockResolvedValue(undefined),
    provider: provider ?? {
      async *translate() {
        yield translated.slice(0, 12)
        yield translated.slice(12)
      },
    },
    refreshIntervalMs: 10,
  }
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTranslationSession', () => {
  it('初始化时恢复最近一次成功结果', async () => {
    const dependencies = makeDependencies()
    vi.mocked(dependencies.readResult).mockResolvedValue(storedResult)
    const { result } = renderHook(() => useTranslationSession(dependencies))

    await waitFor(() => expect(result.current.state).toEqual({
      kind: 'completed',
      result: storedResult,
    }))
    expect(result.current.markdown).toBe(storedResult.markdown)
  })

  it('最近结果读取失败显示非阻塞提示，仍可启动新翻译', async () => {
    const dependencies = makeDependencies()
    vi.mocked(dependencies.readResult).mockRejectedValue(
      new AppError('STORAGE_FAILED', '读取失败'),
    )
    const { result } = renderHook(() => useTranslationSession(dependencies))

    await waitFor(() => expect(result.current.restoreError).toBe('STORAGE_FAILED'))
    expect(result.current.state).toEqual({ kind: 'idle' })
    act(() => { result.current.start(12, article.url) })
    await waitFor(() => expect(result.current.state.kind).toBe('completed'))
  })

  it('先检查配置，再提取并流式展示 Qwen Markdown，完成后不显示提取预览', async () => {
    const dependencies = makeDependencies()
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })
    await waitFor(() => expect(result.current.state.kind).toBe('completed'))

    expect(dependencies.readSettings).toHaveBeenCalledTimes(1)
    expect(dependencies.extractArticle).toHaveBeenCalledWith(12, article.url)
    expect(result.current.markdown).toBe(translated)
    expect(result.current.state.kind).toBe('completed')
  })

  it('配置缺失时打开设置，且不提取或发送正文', async () => {
    const dependencies = makeDependencies()
    vi.mocked(dependencies.readSettings).mockResolvedValue(null)
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })

    await waitFor(() => expect(dependencies.openSettings).toHaveBeenCalledTimes(1))
    expect(dependencies.extractArticle).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ kind: 'idle' })
  })

  it('提取失败进入 failed 且不调用 Provider', async () => {
    const provider: TranslationProvider = { translate: vi.fn() }
    const dependencies = makeDependencies(provider)
    vi.mocked(dependencies.extractArticle).mockRejectedValue(
      new AppError('EXTRACTION_FAILED', '提取失败'),
    )
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })

    await waitFor(() => expect(result.current.state).toEqual({
      kind: 'failed',
      errorCode: 'EXTRACTION_FAILED',
    }))
    expect(provider.translate).not.toHaveBeenCalled()
    expect(result.current.markdown).toBe('')
  })

  it('节流 timer 回调触发时先将 timer 重置为 null', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const provider: TranslationProvider = {
      async *translate() {
        yield translated.slice(0, 12)
        await new Promise<void>((resolve) => { release = resolve })
        yield translated.slice(12)
      },
    }
    const dependencies = makeDependencies(provider)
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result } = renderHook(() => useTranslationSession(dependencies))

    await act(async () => { result.current.start(12, article.url) })
    clearTimeoutSpy.mockClear()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(result.current.markdown).toBe(translated.slice(0, 12))
    expect(clearTimeoutSpy).not.toHaveBeenCalled()
    await act(async () => { release() })
  })

  it('持久化期间取消会使条件提交失效，不覆盖旧结果', async () => {
    let finishSave!: () => void
    let shouldCommit!: () => boolean
    const dependencies = makeDependencies()
    vi.mocked(dependencies.saveResult).mockImplementation((_result, condition) => {
      shouldCommit = condition
      return new Promise<void>((resolve) => { finishSave = resolve })
    })
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })
    await waitFor(() => expect(dependencies.saveResult).toHaveBeenCalledTimes(1))
    expect(shouldCommit()).toBe(true)

    act(() => { result.current.cancel() })
    expect(result.current.state).toEqual({ kind: 'cancelled' })
    expect(shouldCommit()).toBe(false)

    await act(async () => { finishSave() })
    expect(result.current.state).toEqual({ kind: 'cancelled' })
  })

  it('真实 storage.set 开始后取消不改变成功写入', async () => {
    let finishSet!: () => void
    const storage = new Map<string, unknown>([[RESULT_STORAGE_KEY, storedResult]])
    const storageSet = vi.fn((items: Record<string, unknown>) => new Promise<void>((resolve) => {
      finishSet = () => {
        Object.entries(items).forEach(([key, value]) => storage.set(key, value))
        resolve()
      }
    }))
    vi.stubGlobal('chrome', { storage: { local: { set: storageSet } } })
    const dependencies = makeDependencies()
    dependencies.saveResult = saveResult
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })
    await waitFor(() => expect(storageSet).toHaveBeenCalledTimes(1))

    act(() => { result.current.cancel() })
    expect(result.current.state.kind).not.toBe('cancelled')

    await act(async () => { finishSet() })
    await waitFor(() => expect(result.current.state.kind).toBe('completed'))
    expect(storage.get(RESULT_STORAGE_KEY)).toMatchObject({ title: '文章', markdown: translated })
  })

  it('持久化期间卸载会使条件提交失效', async () => {
    let shouldCommit!: () => boolean
    const dependencies = makeDependencies()
    vi.mocked(dependencies.saveResult).mockImplementation((_result, condition) => {
      shouldCommit = condition
      return new Promise<void>(() => undefined)
    })
    const { result, unmount } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })
    await waitFor(() => expect(dependencies.saveResult).toHaveBeenCalledTimes(1))
    expect(shouldCommit()).toBe(true)

    unmount()

    expect(shouldCommit()).toBe(false)
  })

  it('取消后丢弃 Provider 继续产生的过期增量', async () => {
    let releaseSecond!: () => void
    const provider: TranslationProvider = {
      async *translate() {
        yield translated.slice(0, 12)
        await new Promise<void>((resolve) => { releaseSecond = resolve })
        yield translated.slice(12)
      },
    }
    const dependencies = makeDependencies(provider)
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })
    await waitFor(() => expect(result.current.state.kind).toBe('translating'))
    const visibleBeforeCancel = result.current.markdown
    act(() => { result.current.cancel() })
    expect(result.current.state).toEqual({ kind: 'cancelled' })

    await act(async () => { releaseSecond() })
    expect(result.current.state).toEqual({ kind: 'cancelled' })
    expect(result.current.markdown).toBe(visibleBeforeCancel)
  })

  it('快速连续启动两次时丢弃第一次的过期结果，只显示第二次', async () => {
    const provider: TranslationProvider = {
      async *translate(request) {
        yield `# ${request.article.title}译\n\n> **作者**：${request.article.author || '（无）'}\n> **原文链接**：${request.article.url}\n\n${request.article.title}正文`
      },
    }
    const dependencies = makeDependencies(provider)
    const secondArticle: ExtractedArticle = { ...article, title: 'Second Article' }
    let resolveFirst!: (value: ExtractedArticle) => void
    const firstExtraction = new Promise<ExtractedArticle>((resolve) => {
      resolveFirst = resolve
    })
    let extractCalls = 0
    vi.mocked(dependencies.extractArticle).mockImplementation(() => {
      extractCalls += 1
      return extractCalls === 1 ? firstExtraction : Promise.resolve(secondArticle)
    })
    const { result } = renderHook(() => useTranslationSession(dependencies))

    act(() => { result.current.start(12, article.url) })
    // 等待第一次请求已进入提取阶段并挂起。
    await waitFor(() => { expect(extractCalls).toBe(1) })

    act(() => { result.current.start(12, article.url) })

    await waitFor(() => { expect(result.current.state.kind).toBe('completed') })
    const stateAfterSecond = result.current.state
    expect(stateAfterSecond).toMatchObject({
      kind: 'completed',
      result: { title: 'Second Article译' },
    })

    // 第一次提取此时才返回，属于过期响应，应被丢弃。
    await act(async () => { resolveFirst(article) })
    expect(result.current.state).toEqual(stateAfterSecond)
    expect(extractCalls).toBe(2)
  })
})
