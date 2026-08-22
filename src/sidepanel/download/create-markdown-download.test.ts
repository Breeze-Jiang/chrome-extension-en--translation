import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createMarkdownDownload,
  createMarkdownFilename,
} from './create-markdown-download'

const markdown = `# 如何构建可靠的 AI 系统

> **作者**：Jane Doe
> **原文链接**：[https://example.com/article](https://example.com/article)

![架构图](https://example.com/a.png)

\`\`\`ts
const message = '中文'
\`\`\``

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createMarkdownFilename', () => {
  it('使用净化后的标题生成 Markdown 文件名', () => {
    expect(createMarkdownFilename('  如何/构建:可靠*系统?  ')).toBe('如何构建可靠系统.md')
  })

  it('移除尾部点和空格，并限制文件名长度', () => {
    expect(createMarkdownFilename(`${'长'.repeat(120)}. `)).toBe(`${'长'.repeat(100)}.md`)
  })

  it('标题为空、净化后为空或属于 Windows 保留设备名时使用默认文件名', () => {
    expect(createMarkdownFilename('')).toBe('translated-article.md')
    expect(createMarkdownFilename(' <>:"/\\|?* ')).toBe('translated-article.md')
    expect(createMarkdownFilename('CON')).toBe('translated-article.md')
    expect(createMarkdownFilename('LPT9.notes')).toBe('translated-article.md')
  })
})

describe('createMarkdownDownload', () => {
  it('用完整 Markdown 创建 UTF-8 Blob，触发下载并释放对象 URL', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:markdown-download')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    createMarkdownDownload('如何构建可靠的 AI 系统', markdown)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)))
      reader.readAsText(blob, 'UTF-8')
    })
    expect(content).toBe(markdown)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:markdown-download')
  })
})
