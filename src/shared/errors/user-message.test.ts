import { describe, expect, it } from 'vitest'

import { APP_ERROR_CODES } from './app-error'
import { getUserFacingError } from './user-message'

describe('getUserFacingError', () => {
  it('为每个错误码提供非空中文文案', () => {
    for (const code of APP_ERROR_CODES) {
      expect(getUserFacingError(code).message.length).toBeGreaterThan(0)
    }
  })

  it('临时网络错误、限流和流中断映射为重试', () => {
    expect(getUserFacingError('NETWORK_ERROR').action).toBe('retry')
    expect(getUserFacingError('RATE_LIMITED').action).toBe('retry')
    expect(getUserFacingError('STREAM_INTERRUPTED').action).toBe('retry')
  })

  it('鉴权与配置缺失映射为打开设置', () => {
    expect(getUserFacingError('AUTH_ERROR').action).toBe('open-settings')
    expect(getUserFacingError('CONFIG_MISSING').action).toBe('open-settings')
  })

  it('页面受限、提取失败、输出非法、存储失败和内容过长不自动重试', () => {
    expect(getUserFacingError('PAGE_RESTRICTED').action).toBe('none')
    expect(getUserFacingError('EXTRACTION_FAILED').action).toBe('none')
    expect(getUserFacingError('INVALID_OUTPUT').action).toBe('none')
    expect(getUserFacingError('STORAGE_FAILED').action).toBe('none')
    expect(getUserFacingError('CONTENT_TOO_LONG').action).toBe('none')
  })

  it('文案不包含堆栈、密钥或原始响应痕迹', () => {
    for (const code of APP_ERROR_CODES) {
      const { message } = getUserFacingError(code)
      expect(message).not.toMatch(/\bat\s+\S+\.(ts|tsx|js):\d+/)
      expect(message).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/)
      expect(message).not.toMatch(/Bearer\s+[A-Za-z0-9]/)
      expect(message).not.toContain('Authorization')
      expect(message).not.toMatch(/<html/i)
      expect(message).not.toContain('{')
    }
  })
})