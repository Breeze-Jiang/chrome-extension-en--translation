import { describe, expect, it } from 'vitest'

import imagesFixture from '../../test/fixtures/article-images.html?raw'
import tutorialFixture from '../../test/fixtures/article-tutorial.html?raw'

import { convertHtmlToMarkdown } from './converter'

const BASE_URL = 'https://example.com/article'

describe('convertHtmlToMarkdown 图片规范化', () => {
  it('图片严格输出 ![alt](src)，相对地址转为绝对地址', () => {
    const html = '<img src="/images/relative.png" alt="Relative image">'
    const md = convertHtmlToMarkdown(html, BASE_URL)
    expect(md).toContain('![Relative image](https://example.com/images/relative.png)')
  })

  it('srcset 优先选择高分辨率地址', () => {
    const html =
      '<img src="https://example.com/images/low.png" srcset="https://example.com/images/high.png 2x" alt="Srcset image">'
    const md = convertHtmlToMarkdown(html, BASE_URL)
    expect(md).toContain('https://example.com/images/high.png')
    expect(md).not.toContain('low.png')
  })

  it('延迟加载图片使用 data-src，排除占位图', () => {
    const html =
      '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="https://example.com/images/lazy.png" alt="Lazy image">'
    const md = convertHtmlToMarkdown(html, BASE_URL)
    expect(md).toContain('![Lazy image](https://example.com/images/lazy.png)')
    expect(md).not.toContain('base64')
  })
})

describe('convertHtmlToMarkdown 链接与代码', () => {
  it('相对链接转为绝对链接', () => {
    const html = '<a href="/articles/related">Related article</a>'
    const md = convertHtmlToMarkdown(html, BASE_URL)
    expect(md).toContain('[Related article](https://example.com/articles/related)')
  })

  it('代码块内容原样保留', () => {
    const html = '<pre><code>const x = 1;\nconsole.log(x);</code></pre>'
    const md = convertHtmlToMarkdown(html, BASE_URL)
    expect(md).toContain('const x = 1;')
    expect(md).toContain('console.log(x);')
  })
})

describe('convertHtmlToMarkdown 清理', () => {
  it('不包含脚本、样式、表单控件和事件属性', () => {
    const html =
      '<p onclick="evil()">Hello</p><script>alert(1)</script><input type="text"><style>.x{}</style>'
    const md = convertHtmlToMarkdown(html, BASE_URL)
    expect(md).not.toContain('onclick')
    expect(md).not.toContain('alert')
    expect(md).not.toContain('<input')
    expect(md).not.toContain('<style')
  })

  it('相同输入重复转换得到相同结果', () => {
    const html = '<h1>Title</h1><p>Body <a href="/x">link</a></p>'
    const first = convertHtmlToMarkdown(html, BASE_URL)
    const second = convertHtmlToMarkdown(html, BASE_URL)
    expect(first).toBe(second)
  })
})

describe('convertHtmlToMarkdown 固件端到端', () => {
  it('图片固件覆盖绝对、相对、srcset、延迟加载与跟踪像素', () => {
    const doc = new DOMParser().parseFromString(imagesFixture, 'text/html')
    const article = doc.querySelector('article')!

    const md = convertHtmlToMarkdown(article.innerHTML, BASE_URL)

    expect(md).toContain('![Absolute image](https://example.com/images/absolute.png)')
    expect(md).toContain('https://example.com/images/relative.png')
    expect(md).toContain('https://example.com/images/high.png')
    expect(md).toContain('https://example.com/images/lazy.png')
    expect(md).toContain('![Lazy srcset image](https://example.com/images/lazy-large.png)')
    expect(md).not.toContain('base64')
    expect(md).not.toContain('Tracking pixel')
    expect(md).toContain('const x = 1;')
  })

  it('教程固件保留列表、引用、表格和代码结构', () => {
    const doc = new DOMParser().parseFromString(tutorialFixture, 'text/html')
    const article = doc.querySelector('article')!

    const md = convertHtmlToMarkdown(article.innerHTML, BASE_URL)

    expect(md).toMatch(/-\s+Node\.js 20 or newer/)
    expect(md).toMatch(/1\.\s+Create a project directory\./)
    expect(md).toContain('> Keep the endpoint free of secrets')
    expect(md).toMatch(/\| Option\s+\| Purpose\s+\|/)
    expect(md).toContain('| PORT')
    expect(md).toContain('```')
    expect(md).toContain('const status = { ok: true }')
  })
})
