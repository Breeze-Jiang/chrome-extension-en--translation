/**
 * 统一领域错误码与领域错误类型。
 * 错误在跨上下文边界以错误码传递，不直接传递第三方异常对象。
 */

export const APP_ERROR_CODES = [
  'PAGE_RESTRICTED',
  'EXTRACTION_FAILED',
  'CONFIG_MISSING',
  'NETWORK_ERROR',
  'AUTH_ERROR',
  'RATE_LIMITED',
  'STREAM_INTERRUPTED',
  'INVALID_OUTPUT',
  'STORAGE_FAILED',
  'CONTENT_TOO_LONG',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

/** 判断未知值是否为受支持的领域错误码。 */
export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && (APP_ERROR_CODES as readonly string[]).includes(value)
}

/** 领域错误。message 面向用户，cause 仅用于本地诊断。 */
export class AppError extends Error {
  readonly code: AppErrorCode
  readonly cause?: unknown

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.cause = options?.cause
  }
}

/** 判断未知值是否为 AppError。 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/**
 * 将任意抛出的值归一化为领域错误。
 * 已存在的 AppError 原样返回，其余统一包装为网络错误。
 */
export function toAppError(input: unknown): AppError {
  if (input instanceof AppError) {
    return input
  }
  return new AppError('NETWORK_ERROR', '请求失败，请检查网络或稍后重试。', { cause: input })
}
