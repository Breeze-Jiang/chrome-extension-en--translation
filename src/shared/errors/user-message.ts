import type { AppErrorCode } from './app-error'

/** 失败状态下的推荐操作。 */
export type ErrorAction = 'retry' | 'open-settings' | 'none'

/** 面向用户的错误信息与推荐操作。 */
export interface UserFacingError {
  message: string
  action: ErrorAction
}

/**
 * 各领域错误码对应的稳定中文文案与操作。
 * 临时网络/限流/流中断可重试；鉴权与配置缺失引导打开设置；
 * 页面受限、提取失败、输出非法与存储失败不自动重试。
 * 文案不得包含堆栈、第三方原始响应、正文或密钥。
 */
const USER_MESSAGES: Record<AppErrorCode, UserFacingError> = {
  PAGE_RESTRICTED: {
    message: '不支持当前页面，无法提取文章内容。',
    action: 'none',
  },
  EXTRACTION_FAILED: {
    message: '无法识别当前页面的主要文章内容。',
    action: 'none',
  },
  CONFIG_MISSING: {
    message: '缺少模型配置，请完成设置后再翻译。',
    action: 'open-settings',
  },
  NETWORK_ERROR: {
    message: '无法连接模型服务，请检查网络后重试。',
    action: 'retry',
  },
  AUTH_ERROR: {
    message: '鉴权失败，请检查 API Key。',
    action: 'open-settings',
  },
  RATE_LIMITED: {
    message: '请求过于频繁，请稍后重试。',
    action: 'retry',
  },
  STREAM_INTERRUPTED: {
    message: '翻译过程中断，请重试。',
    action: 'retry',
  },
  INVALID_OUTPUT: {
    message: '翻译结果校验失败，未生成有效译文。',
    action: 'none',
  },
  STORAGE_FAILED: {
    message: '译文已生成，但保存失败。',
    action: 'none',
  },
  CONTENT_TOO_LONG: {
    message: '文章超过当前支持的翻译长度限制。',
    action: 'none',
  },
}

/** 将领域错误码映射为面向用户的文案与推荐操作。 */
export function getUserFacingError(code: AppErrorCode): UserFacingError {
  return USER_MESSAGES[code]
}