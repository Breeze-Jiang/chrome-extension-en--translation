import { describe, expect, it } from 'vitest'

import type { ExtractedArticle } from '../shared/contracts/article'
import { buildTranslationMessages, TRANSLATION_SYSTEM_PROMPT } from './prompt-policy'

const article: ExtractedArticle = {
  version: 1,
  url: 'https://example.com/article',
  title: 'How to Build Reliable AI Systems',
  author: 'Jane Doe',
  language: 'en',
  siteName: 'Example',
  markdown: '# Title\n\nBody with ![alt](https://example.com/a.png)',
  charCount: 50,
  extractor: 'defuddle',
  qualityScore: 85,
  extractedAt: '2026-08-21T10:00:00.000Z',
}

describe('buildTranslationMessages', () => {
  it('返回 system 和 user 两条消息', () => {
    const messages = buildTranslationMessages(article)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })

  it('system 提示词要求只输出 Markdown 并保留结构', () => {
    expect(TRANSLATION_SYSTEM_PROMPT).toContain('只输出最终 Markdown')
    expect(TRANSLATION_SYSTEM_PROMPT).toContain('作者名保留原文')
    expect(TRANSLATION_SYSTEM_PROMPT).toContain('![alt](src)')
    expect(TRANSLATION_SYSTEM_PROMPT).toContain('原文链接')
  })

  it('user 消息包含标题、作者、原文链接和正文', () => {
    const content = buildTranslationMessages(article)[1].content
    expect(content).toContain('How to Build Reliable AI Systems')
    expect(content).toContain('Jane Doe')
    expect(content).toContain('https://example.com/article')
    expect(content).toContain('Body with')
  })

  it('作者为空时仍保留作者行', () => {
    const content = buildTranslationMessages({ ...article, author: '' })[1].content
    expect(content).toContain('作者')
  })
})
