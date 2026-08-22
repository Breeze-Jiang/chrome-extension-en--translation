import { describe, expect, it } from 'vitest'

import fallbackHtml from '../../test/fixtures/article-fallback.html?raw'
import newsHtml from '../../test/fixtures/article-news.html?raw'
import noContentHtml from '../../test/fixtures/article-no-content.html?raw'
import noisyHtml from '../../test/fixtures/article-noisy.html?raw'
import realFallbackHtml from '../../test/fixtures/article-real-fallback.html?raw'
import standardHtml from '../../test/fixtures/article-standard.html?raw'
import tutorialHtml from '../../test/fixtures/article-tutorial.html?raw'

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

describe('extractArticle 页面类型与噪声排除', () => {
  it.each([
    ['新闻', newsHtml, 'City Opens Its First Solar-Powered Library'],
    ['技术教程', tutorialHtml, 'Build a Small Status API'],
  ])('%s 固件提取标题与主要正文', (_type, html, title) => {
    const result = extractArticle(toDocument(html), 'https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.title).toContain(title)
    expect(result!.content).toContain('<p')
  })

  it.each([noisyHtml, newsHtml])('噪声固件排除导航、广告、评论和订阅文本', (html) => {
    const result = extractArticle(toDocument(html), 'https://example.com/article')

    expect(result).not.toBeNull()
    expect(result!.content).not.toContain('Buy now')
    expect(result!.content).not.toContain('promotional comment')
    expect(result!.content).not.toContain('Great article')
    expect(result!.content).not.toContain('Subscribe')
    expect(result!.content).not.toContain('Docs navigation')
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

  it('正文过短页面返回 null', () => {
    const doc = toDocument(fallbackHtml)

    expect(extractArticle(doc, 'https://example.com/article')).toBeNull()
  })

  it('真实提取器可在主提取失败时回退到 Readability', () => {
    const primary: Extractor = { id: 'defuddle', extract: () => null }
    const result = extractArticle(
      toDocument(realFallbackHtml),
      'https://example.com/community-software',
      { primary },
    )

    expect(result).not.toBeNull()
    expect(result!.extractor).toBe('readability')
    expect(result!.title).toContain('Maintaining Community Software')
    expect(result!.content).toContain('Community software survives')
  })

  it('无正文页面返回 null', () => {
    expect(extractArticle(toDocument(noContentHtml), 'https://example.com/search')).toBeNull()
  })
})
