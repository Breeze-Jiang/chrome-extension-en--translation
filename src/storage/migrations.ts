import type { TranslationResult } from '../shared/contracts/translation'
import { validateTranslationResult } from '../shared/contracts/translation'

/** 将未知的持久化数据迁移到当前翻译结果契约；无法迁移时忽略。 */
export function migrateTranslationResult(input: unknown): TranslationResult | null {
  try {
    return validateTranslationResult(input)
  } catch {
    return null
  }
}
