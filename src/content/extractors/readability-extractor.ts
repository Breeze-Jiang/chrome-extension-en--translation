import { Readability } from '@mozilla/readability'

import type { Extractor, ExtractionCandidate } from './extractor'

/** Readability 回退提取器：在 Defuddle 失败或质量不足时使用。 */
export class ReadabilityExtractor implements Extractor {
  readonly id = 'readability' as const

  extract(document: Document, _url: string): ExtractionCandidate | null {
    try {
      const result = new Readability(document).parse()
      if (!result) {
        return null
      }
      const content = result.content || ''
      if (content.trim().length === 0) {
        return null
      }

      return {
        title: result.title || '',
        author: result.byline || '',
        siteName: result.siteName || '',
        language: result.lang || '',
        content,
        charCount: result.length || content.length,
        extractor: 'readability',
      }
    } catch {
      return null
    }
  }
}
