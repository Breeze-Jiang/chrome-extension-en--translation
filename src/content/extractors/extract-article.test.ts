import { describe, expect, it } from 'vitest'

import fallbackHtml from '../../test/fixtures/article-fallback.html?raw'
import noisyHtml from '../../test/fixtures/article-noisy.html?raw'
import standardHtml from '../../test/fixtures/article-standard.html?raw'

import { extractArticle } from './extract-article'
import type { Extractor, ExtractionCandidate } from './extractor'

function toDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const lowQuality: ExtractionCandidate = {
  title: '',
  author: '',
  siteName: '',
  language: 'en',
  content: '<p>short</p>',
  charCount: 5,
  extractor: 'defuddle',
}

const highQuality: ExtractionCandidate = {
  title: 'A Long Article',
  author: 'Jane Doe',
  siteName: 'Example',
  language: 'en',
  content: `<p>${'long text '.repeat(100)}</p><p>Second paragraph.</p><p>Third paragraph.</p>`,
  charCount: 1000,
  extractor: 'readability',
}

const mockPrimary: Extractor = {
  id: 'defuddle',
  extract: () => lowQuality,
}

const mockFallback: Extractor = {
  id: 'readability',
  extract: () => highQuality,
}

describe('extractArticle 标准文章', () => {
  it('标准文章优先选择 Defuddle', () => {
    const doc = toDocument(standardHtml)
    const result = extractArticle(doc, 'https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.extractor).toBe('defuddle')
    expect(result!.title).toContain('Reliable AI Systems')
    expect(result!.author).toContain('Jane Doe')
  })

  it('提取过程不修改原 DOM', () => {
    const doc = toDocument(standardHtml)
    const before = doc.documentElement.outerHTML

    extractArticle(doc, 'https://example.com/article')

    expect(doc.documentElement.outerHTML).toBe(before)
  })
})

describe('extractArticle 噪声排除', () => {
  it('新闻噪声固件不包含导航、广告、评论和订阅文本', () => {
    const doc = toDocument(noisyHtml)
    const result = extractArticle(doc, 'https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.content).not.toContain('Home')
    expect(result!.content).not.toContain('Buy now')
    expect(result!.content).not.toContain('Great article')
    expect(result!.content).not.toContain('Subscribe')
  })
})

describe('extractArticle 回退', () => {
  it('低质量主结果触发 Readability 回退并选择更高分结果', () => {
    const doc = toDocument(standardHtml)

    const result = extractArticle(doc, 'https://example.com/article', {
      primary: mockPrimary,
      fallback: mockFallback,
    })

    expect(result).not.toBeNull()
    expect(result!.extractor).toBe('readability')
    expect(result!.title).toBe('A Long Article')
  })

  it('真实短文章也能提取到结果', () => {
    const doc = toDocument(fallbackHtml)
    const result = extractArticle(doc, 'https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.title).toContain('Short Note')
  })
})
