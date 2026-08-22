import { describe, expect, it } from 'vitest'

import type { ExtractedArticle } from '../shared/contracts/article'
import {
  buildChunkedMessages,
  buildTranslationMessages,
  TRANSLATION_CONTINUATION_SYSTEM_PROMPT,
  TRANSLATION_SYSTEM_PROMPT,
} from './prompt-policy'

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

describe('buildChunkedMessages', () => {
  const chunks = ['## First\n\nbody one', '## Second\n\nbody two']

  it('返回每个分段对应的消息组', () => {
    const sets = buildChunkedMessages(article, chunks)
    expect(sets).toHaveLength(2)
    expect(sets[0]).toHaveLength(2)
    expect(sets[1]).toHaveLength(2)
  })

  it('首段包含标题、作者和原文链接，后续段仅输出正文', () => {
    const sets = buildChunkedMessages(article, chunks)

    const firstUser = sets[0][1].content
    expect(firstUser).toContain('文章标题：')
    expect(firstUser).toContain('作者：')
    expect(firstUser).toContain('原文链接：')
    expect(firstUser).toContain('body one')

    const secondUser = sets[1][1].content
    expect(secondUser).toContain('body two')
    expect(secondUser).toContain('第 2/2 部分')
    expect(secondUser).not.toContain('作者：')
  })

  it('后续段系统提示词禁止重复输出标题与元数据', () => {
    const sets = buildChunkedMessages(article, chunks)
    expect(sets[1][0].content).toBe(TRANSLATION_CONTINUATION_SYSTEM_PROMPT)
    expect(TRANSLATION_CONTINUATION_SYSTEM_PROMPT).toContain('不要输出文章的一级标题')
  })
})
