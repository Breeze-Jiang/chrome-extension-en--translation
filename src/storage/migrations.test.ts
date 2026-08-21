import { describe, expect, it } from 'vitest'

import { migrateTranslationResult } from './migrations'

const storedResult = {
  version: 1,
  sourceUrl: 'https://example.com/article',
  title: '文章',
  author: '',
  markdown: '# 文章\n\n正文',
  completedAt: '2026-08-21T10:00:00.000Z',
  model: 'qwen-plus',
}

describe('migrateTranslationResult', () => {
  it('返回当前版本的合法结果', () => {
    expect(migrateTranslationResult(storedResult)).toEqual(storedResult)
  })

  it('拒绝未知版本、缺失字段和非对象数据', () => {
    expect(migrateTranslationResult({ ...storedResult, version: 99 })).toBeNull()
    expect(migrateTranslationResult({ version: 1, title: '文章' })).toBeNull()
    expect(migrateTranslationResult(null)).toBeNull()
  })
})
