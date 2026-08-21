import { describe, expect, it } from 'vitest'

import type { ExtractedArticle } from '../shared/contracts/article'
import { isAppError } from '../shared/errors/app-error'
import { validateTranslationOutput } from './output-validator'

const article: ExtractedArticle = {
  version: 1,
  url: 'https://example.com/article',
  title: 'Article',
  author: 'Jane Doe',
  language: 'en',
  siteName: 'Example',
  markdown: [
    '## First',
    '',
    'See [documentation](https://example.com/docs).',
    '',
    '![Diagram](https://example.com/diagram.png)',
    '',
    '```ts',
    'const answer = 42',
    '```',
  ].join('\n'),
  charCount: 100,
  extractor: 'defuddle',
  qualityScore: 90,
  extractedAt: '2026-08-21T10:00:00.000Z',
}

const validOutput = [
  '# 文章',
  '',
  '> **作者**：Jane Doe',
  '> **原文链接**：https://example.com/article',
  '',
  '## 第一部分',
  '',
  '参见[文档](https://example.com/docs)。',
  '',
  '![示意图](https://example.com/diagram.png)',
  '',
  '```ts',
  'const answer = 42',
  '```',
].join('\n')

describe('validateTranslationOutput', () => {
  it('接受元数据顺序正确且保留链接、图片和代码的译文', () => {
    expect(validateTranslationOutput(validOutput, article)).toEqual({
      title: '文章',
      markdown: validOutput,
    })
  })

  it.each([
    ['含括号 URL', 'https://example.com/a_(b)/image.png'],
    ['含转义括号 URL', String.raw`https://example.com/a\(b\)/image.png`],
  ])('接受并校验%s', (_name, target) => {
    const markdown = article.markdown.replace(
      'https://example.com/diagram.png',
      target,
    )
    const output = validOutput.replace(
      'https://example.com/diagram.png',
      target,
    )

    expect(validateTranslationOutput(output, { ...article, markdown }).markdown).toBe(output)
    expect(() => validateTranslationOutput(
      output.replace('/image.png', '/changed.png'),
      { ...article, markdown },
    )).toThrow()
  })

  it.each([
    validOutput.replace('# 文章', '文章'),
    validOutput.replace('Jane Doe', 'John Doe'),
    validOutput.replace('> **作者**：Jane Doe\n> **原文链接**', '> **原文链接**'),
    validOutput.replace('https://example.com/article', 'https://example.com/other'),
    validOutput.slice(0, validOutput.indexOf('\n\n## 第一部分')),
    validOutput.replace('https://example.com/diagram.png', 'https://example.com/changed.png'),
    validOutput.replace('https://example.com/docs', 'https://example.com/changed'),
    validOutput.replace('const answer = 42', 'const answer = 43'),
  ])('拒绝结构或受保护内容被破坏的输出', (output) => {
    const error = (() => {
      try {
        validateTranslationOutput(output, article)
      } catch (caught: unknown) {
        return caught
      }
    })()

    expect(isAppError(error)).toBe(true)
    if (isAppError(error)) {
      expect(error.code).toBe('INVALID_OUTPUT')
    }
  })
})
