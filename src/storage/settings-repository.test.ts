import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAppError } from '../shared/errors/app-error'
import {
  DEFAULT_BASE_URL,
  SETTINGS_STORAGE_KEY,
  isAllowedBaseUrl,
  isCompleteSettings,
  readSettings,
  saveSettings,
} from './settings-repository'

const storageGet = vi.fn()
const storageSet = vi.fn()

beforeEach(() => {
  storageGet.mockReset()
  storageSet.mockReset()
  vi.stubGlobal('chrome', {
    storage: { local: { get: storageGet, set: storageSet } },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const validSettings = {
  version: 1,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: 'sk-test-key',
  model: 'qwen-plus',
}

describe('isAllowedBaseUrl', () => {
  it('接受受信任的 HTTPS Qwen 地址', () => {
    expect(isAllowedBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe(true)
    expect(isAllowedBaseUrl(DEFAULT_BASE_URL)).toBe(true)
  })

  it('拒绝 HTTP 地址', () => {
    expect(isAllowedBaseUrl('http://dashscope.aliyuncs.com/compatible-mode/v1')).toBe(false)
  })

  it('拒绝不受信任的域名', () => {
    expect(isAllowedBaseUrl('https://evil.example.com/v1')).toBe(false)
  })

  it('拒绝非法 URL 和空值', () => {
    expect(isAllowedBaseUrl('not-a-url')).toBe(false)
    expect(isAllowedBaseUrl('')).toBe(false)
  })
})

describe('isCompleteSettings', () => {
  it('接受完整配置', () => {
    expect(isCompleteSettings(validSettings)).toBe(true)
  })

  it('拒绝缺少 API Key 的配置', () => {
    expect(
      isCompleteSettings({
        version: 1,
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-plus',
      }),
    ).toBe(false)
  })

  it('拒绝版本不受支持的配置', () => {
    expect(isCompleteSettings({ ...validSettings, version: 99 })).toBe(false)
  })

  it('拒绝缺少字段或非对象', () => {
    expect(isCompleteSettings(null)).toBe(false)
    expect(isCompleteSettings('settings')).toBe(false)
    expect(isCompleteSettings({ ...validSettings, baseUrl: '' })).toBe(false)
  })
})

describe('readSettings', () => {
  it('无存储时返回 null', async () => {
    storageGet.mockResolvedValue({})
    await expect(readSettings()).resolves.toBeNull()
  })

  it('返回合法配置', async () => {
    storageGet.mockResolvedValue({ [SETTINGS_STORAGE_KEY]: validSettings })
    await expect(readSettings()).resolves.toEqual(validSettings)
  })

  it('存储数据非法时返回 null', async () => {
    storageGet.mockResolvedValue({ [SETTINGS_STORAGE_KEY]: { version: 1 } })
    await expect(readSettings()).resolves.toBeNull()
  })

  it.each([
    'http://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://evil.example.com/v1',
    'not-a-url',
  ])('存储配置含不受信任 Base URL 时返回 null：%s', async (baseUrl) => {
    storageGet.mockResolvedValue({
      [SETTINGS_STORAGE_KEY]: { ...validSettings, baseUrl },
    })
    await expect(readSettings()).resolves.toBeNull()
  })

  it('存储读取抛错时归一化为 STORAGE_FAILED', async () => {
    storageGet.mockRejectedValue(new Error('quota'))
    const error = await readSettings().catch((e: unknown) => e)
    if (!isAppError(error)) {
      throw new Error('expected AppError')
    }
    expect(error.code).toBe('STORAGE_FAILED')
  })
})

describe('saveSettings', () => {
  it('以配置存储键覆盖写入', async () => {
    storageSet.mockResolvedValue(undefined)
    await saveSettings(validSettings)
    expect(storageSet).toHaveBeenCalledWith({ [SETTINGS_STORAGE_KEY]: validSettings })
  })

  it('存储写入抛错时归一化为 STORAGE_FAILED', async () => {
    storageSet.mockRejectedValue(new Error('quota'))
    const error = await saveSettings(validSettings).catch((e: unknown) => e)
    if (!isAppError(error)) {
      throw new Error('expected AppError')
    }
    expect(error.code).toBe('STORAGE_FAILED')
  })
})
