import {
  type TranslationResult,
  validateTranslationResult,
} from '../shared/contracts/translation'
import { AppError } from '../shared/errors/app-error'
import { migrateTranslationResult } from './migrations'

/** 最近一次成功翻译结果在 Chrome Storage Local 中的固定键。 */
export const RESULT_STORAGE_KEY = 'latestTranslationResult'

/** 读取最近一次成功结果；无结果或数据无法迁移时返回 null。 */
export async function readResult(): Promise<TranslationResult | null> {
  let raw: unknown
  try {
    const stored = await chrome.storage.local.get(RESULT_STORAGE_KEY)
    raw = stored[RESULT_STORAGE_KEY]
  } catch (error) {
    throw new AppError('STORAGE_FAILED', '读取最近翻译结果失败。', { cause: error })
  }
  return migrateTranslationResult(raw)
}

/** 校验并以单次覆盖方式保存完整成功结果。 */
export async function saveResult(
  result: unknown,
  shouldCommit: () => boolean = () => true,
  onCommit: () => void = () => undefined,
): Promise<void> {
  try {
    const validated = validateTranslationResult(result)
    await Promise.resolve()
    if (!shouldCommit()) {
      return
    }
    onCommit()
    await chrome.storage.local.set({ [RESULT_STORAGE_KEY]: validated })
  } catch (error) {
    throw new AppError('STORAGE_FAILED', '保存最近翻译结果失败。', { cause: error })
  }
}
