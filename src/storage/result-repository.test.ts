import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAppError } from '../shared/errors/app-error'
import {
  RESULT_STORAGE_KEY,
  readResult,
  saveResult,
} from './result-repository'

const storageGet = vi.fn()
const storageSet = vi.fn()
const storageRemove = vi.fn()
const result = {
  version: 1,
  sourceUrl: 'https://example.com/article',
  title: '文章',
  author: '',
  markdown: '# 文章\n\n正文',
  completedAt: '2026-08-21T10:00:00.000Z',
  model: 'qwen-plus',
}

beforeEach(() => {
  storageGet.mockReset()
  storageSet.mockReset()
  storageRemove.mockReset()
  vi.stubGlobal('chrome', {
    storage: { local: { get: storageGet, set: storageSet, remove: storageRemove } },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readResult', () => {
  it('无结果时返回 null，合法结果经迁移后返回', async () => {
    storageGet.mockResolvedValueOnce({}).mockResolvedValueOnce({ [RESULT_STORAGE_KEY]: result })

    await expect(readResult()).resolves.toBeNull()
    await expect(readResult()).resolves.toEqual(result)
  })

  it('版本未知或内容非法时返回 null', async () => {
    storageGet.mockResolvedValue({
      [RESULT_STORAGE_KEY]: { ...result, version: 99 },
    })

    await expect(readResult()).resolves.toBeNull()
  })

  it('读取失败归一化为 STORAGE_FAILED', async () => {
    storageGet.mockRejectedValue(new Error('storage unavailable'))
    const error = await readResult().catch((caught: unknown) => caught)

    expect(isAppError(error) && error.code).toBe('STORAGE_FAILED')
  })
})

describe('saveResult', () => {
  it('以固定键单次覆盖写入完整结果', async () => {
    storageSet.mockResolvedValue(undefined)

    await saveResult(result)

    expect(storageSet).toHaveBeenCalledTimes(1)
    expect(storageSet).toHaveBeenCalledWith({ [RESULT_STORAGE_KEY]: result })
    expect(Object.keys(result)).toEqual([
      'version',
      'sourceUrl',
      'title',
      'author',
      'markdown',
      'completedAt',
      'model',
    ])
  })

  it('仅写入运行时校验后重建的白名单对象，丢弃额外敏感字段', async () => {
    storageSet.mockResolvedValue(undefined)
    const input = { ...result, apiKey: 'sk-sensitive', rawHtml: '<main>secret</main>' }

    await saveResult(input)

    const saved = storageSet.mock.calls[0]?.[0][RESULT_STORAGE_KEY]
    expect(saved).toEqual(result)
    expect(saved).not.toBe(input)
    expect(saved).not.toHaveProperty('apiKey')
    expect(saved).not.toHaveProperty('rawHtml')
  })

  it.each([
    null,
    { ...result, markdown: '' },
    { ...result, completedAt: 123 },
  ])('拒绝运行时非法结果且不写入', async (input) => {
    const error = await saveResult(input as typeof result).catch((caught: unknown) => caught)

    expect(isAppError(error) && error.code).toBe('STORAGE_FAILED')
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('提交条件失效时不覆盖旧结果', async () => {
    const shouldCommit = vi.fn(() => false)

    await saveResult(result, shouldCommit)

    expect(shouldCommit).toHaveBeenCalledTimes(1)
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('写入失败归一化为 STORAGE_FAILED', async () => {
    storageSet.mockRejectedValue(new Error('quota'))
    const error = await saveResult(result).catch((caught: unknown) => caught)

    expect(isAppError(error) && error.code).toBe('STORAGE_FAILED')
  })
})
