import { describe, expect, it } from 'vitest'

import { evaluateTab, extractDomain } from './tab-policy'

describe('extractDomain', () => {
  it('从普通 HTTPS URL 提取域名', () => {
    expect(extractDomain('https://example.com/articles/1')).toBe('example.com')
  })

  it('从 HTTP URL 提取域名', () => {
    expect(extractDomain('http://sub.example.org/path')).toBe('sub.example.org')
  })

  it('非法 URL 返回空字符串', () => {
    expect(extractDomain('not a url')).toBe('')
    expect(extractDomain('')).toBe('')
  })
})

describe('evaluateTab', () => {
  it('接受普通 HTTPS 文章页', () => {
    const result = evaluateTab('https://example.com/article')
    expect(result.processable).toBe(true)
    expect(result.reason).toBeNull()
    expect(result.domain).toBe('example.com')
  })

  it('接受普通 HTTP 页面', () => {
    expect(evaluateTab('http://example.com/article').processable).toBe(true)
  })

  it('拒绝空 URL', () => {
    const result = evaluateTab('')
    expect(result.processable).toBe(false)
    expect(result.reason).toBe('PAGE_RESTRICTED')
    expect(result.domain).toBe('')
  })

  it('拒绝 chrome:// 内部页', () => {
    const result = evaluateTab('chrome://newtab/')
    expect(result.processable).toBe(false)
    expect(result.reason).toBe('PAGE_RESTRICTED')
  })

  it('拒绝扩展页 chrome-extension://', () => {
    expect(evaluateTab('chrome-extension://abcdef/options.html').processable).toBe(false)
  })

  it('拒绝 about:blank 等 about 页面', () => {
    expect(evaluateTab('about:blank').processable).toBe(false)
  })

  it('拒绝 file:// 与 javascript: 等非 http 协议', () => {
    expect(evaluateTab('file:///C:/article.html').processable).toBe(false)
    expect(evaluateTab('javascript:void(0)').processable).toBe(false)
  })

  it('拒绝非法 URL 字符串', () => {
    expect(evaluateTab('not a url').processable).toBe(false)
  })
})
