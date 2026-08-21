import { SETTINGS_CONTRACT_VERSION } from '../shared/contracts/settings'
import type { ModelSettings } from '../shared/contracts/settings'
import { AppError } from '../shared/errors/app-error'

/** 模型配置在 Chrome Storage Local 中的存储键。 */
export const SETTINGS_STORAGE_KEY = 'modelSettings'

/** 首期允许的受信任 Qwen OpenAI-compatible 服务域名。 */
export const ALLOWED_BASE_URL_HOST = 'dashscope.aliyuncs.com'

/** 默认的 Qwen OpenAI-compatible 服务地址。 */
export const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

/**
 * 判断服务地址是否为允许的 HTTPS Qwen OpenAI-compatible 地址。
 * 仅接受 https 协议且主机为受信任域名，避免申请任意主机权限。
 */
export function isAllowedBaseUrl(input: string): boolean {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return false
  }
  return url.protocol === 'https:' && url.hostname === ALLOWED_BASE_URL_HOST
}

/** 判断未知值是否为字段齐全且版本正确的模型配置。 */
export function isCompleteSettings(value: unknown): value is ModelSettings {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    candidate.version === SETTINGS_CONTRACT_VERSION &&
    typeof candidate.baseUrl === 'string' &&
    candidate.baseUrl.length > 0 &&
    typeof candidate.apiKey === 'string' &&
    candidate.apiKey.length > 0 &&
    typeof candidate.model === 'string' &&
    candidate.model.length > 0
  )
}

/** 从 Chrome Storage Local 读取模型配置；无配置或数据非法时返回 null。 */
export async function readSettings(): Promise<ModelSettings | null> {
  let raw: unknown
  try {
    const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
    raw = stored[SETTINGS_STORAGE_KEY]
  } catch (error) {
    throw new AppError('STORAGE_FAILED', '读取配置失败。', { cause: error })
  }
  if (!isCompleteSettings(raw) || !isAllowedBaseUrl(raw.baseUrl)) {
    return null
  }
  return raw
}

/** 将模型配置单次覆盖写入 Chrome Storage Local。 */
export async function saveSettings(settings: ModelSettings): Promise<void> {
  try {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
  } catch (error) {
    throw new AppError('STORAGE_FAILED', '保存配置失败。', { cause: error })
  }
}
