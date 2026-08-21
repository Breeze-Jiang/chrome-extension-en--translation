import Defuddle from 'defuddle'

import type { Extractor, ExtractionCandidate } from './extractor'

/** Defuddle 主提取器：在克隆 DOM 上提取标题、作者和正文 HTML。 */
export class DefuddleExtractor implements Extractor {
  readonly id = 'defuddle' as const

  extract(document: Document, url: string): ExtractionCandidate | null {
    try {
      const result = new Defuddle(document, {
        url,
        markdown: false,
        useAsync: false,
        removeImages: false,
        includeReplies: false,
      }).parse()

      const content = result.content || ''
      if (content.trim().length === 0) {
        return null
      }

      return {
        title: result.title || '',
        author: result.author || '',
        siteName: result.site || result.domain || '',
        language: result.language || '',
        content,
        charCount: result.wordCount || content.length,
        extractor: 'defuddle',
      }
    } catch {
      return null
    }
  }
}
