import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { extractArticleAsArticle } from '../../src/content/extractors/extract-article'
import type { Extractor } from '../../src/content/extractors/extractor'
import { RESULT_STORAGE_KEY, readResult } from '../../src/storage/result-repository'
import { TranslationView } from '../../src/sidepanel/components/TranslationView'
import { createMarkdownDownload } from '../../src/sidepanel/download/create-markdown-download'
import { TranslationOrchestrator } from '../../src/translation/orchestrator'
import type { TranslationProvider } from '../../src/translation/providers/translation-provider'

const SOURCE_URL = 'https://example.com/guides/reliable-ai'
const TEST_API_KEY = 'integration-only-secret-that-must-not-ship'
const sourceHtml = `<!doctype html>
<html lang="en"><head><title>Reliable AI</title></head><body>
  <nav>Navigation noise</nav>
  <article>
    <h1>Reliable AI</h1>
    <p>Reliable systems preserve technical material during translation.</p>
    <p><a href="/reference">Reference</a></p>
    <img src="/architecture.png" alt="Architecture">
    <pre><code>const safe = true;</code></pre>
    <script>globalThis.__articleScriptExecuted = true</script>
    <p onclick="globalThis.__articleHandlerExecuted = true">Final paragraph.</p>
  </article>
</body></html>`

const extractor: Extractor = {
  id: 'defuddle',
  extract(document) {
    const article = document.querySelector('article')
    if (!article) return null
    return {
      title: 'Reliable AI',
      author: 'Jane Doe',
      siteName: 'Example',
      language: 'en',
      content: article.innerHTML,
      charCount: article.textContent?.length ?? 0,
      extractor: 'defuddle',
    }
  },
}

const translatedMarkdown = `# 可靠的 AI 系统

> **作者**：Jane Doe
> **原文链接**：${SOURCE_URL}

可靠的系统会在翻译过程中保留技术材料。

[参考资料](https://example.com/reference)

![Architecture](https://example.com/architecture.png)

\`\`\`
const safe = true;
\`\`\``

const storage = new Map<string, unknown>()
const storageGet = vi.fn(async (key: string) => ({ [key]: storage.get(key) }))
const storageSet = vi.fn(async (items: Record<string, unknown>) => {
  Object.entries(items).forEach(([key, value]) => storage.set(key, value))
})

beforeEach(() => {
  storage.clear()
  storageGet.mockClear()
  storageSet.mockClear()
  vi.stubGlobal('chrome', { storage: { local: { get: storageGet, set: storageSet } } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (globalThis as Record<string, unknown>).__articleScriptExecuted
  delete (globalThis as Record<string, unknown>).__articleHandlerExecuted
})

describe('翻译主流程集成', () => {
  it('串联提取、Markdown、模拟流、校验、存储与下载', async () => {
    const document = new DOMParser().parseFromString(sourceHtml, 'text/html')
    const article = extractArticleAsArticle(document, SOURCE_URL, {
      primary: extractor,
      fallback: extractor,
    })

    expect(article).not.toBeNull()
    expect(article?.markdown).toContain('[Reference](https://example.com/reference)')
    expect(article?.markdown).toContain('![Architecture](https://example.com/architecture.png)')
    expect(article?.markdown).toContain('const safe = true;')
    expect(article?.markdown).not.toMatch(/<script|onclick|Navigation noise/)

    const pieces = [
      translatedMarkdown.slice(0, 34),
      translatedMarkdown.slice(34, 120),
      translatedMarkdown.slice(120),
    ]
    const provider: TranslationProvider = {
      async *translate() {
        for (const piece of pieces) yield piece
      },
    }
    const snapshots: string[] = []
    const result = await new TranslationOrchestrator(provider).translate({
      article: article!,
      settings: {
        version: 1,
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: TEST_API_KEY,
        model: 'qwen-plus',
      },
      signal: new AbortController().signal,
      onSnapshot: (markdown) => snapshots.push(markdown),
    })

    expect(snapshots).toHaveLength(3)
    expect(snapshots.at(-1)).toBe(translatedMarkdown)
    expect(result).toMatchObject({ title: '可靠的 AI 系统', markdown: translatedMarkdown })
    expect(storageSet).toHaveBeenCalledTimes(1)
    expect(await readResult()).toEqual(result)
    expect(JSON.stringify(storage.get(RESULT_STORAGE_KEY))).not.toContain(TEST_API_KEY)

    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:translated-markdown')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    createMarkdownDownload(result!.title, result!.markdown)

    const blob = createObjectURL.mock.calls[0][0]
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)))
      reader.readAsText(blob, 'UTF-8')
    })
    expect(content).toBe(translatedMarkdown)
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:translated-markdown')
  })
})

describe('渲染安全', () => {
  it('Markdown 中的脚本、事件属性与危险 URL 不会进入可执行 DOM', async () => {
    const attack = `# 安全标题

<script>globalThis.__articleScriptExecuted = true</script>

<img src=x onerror="globalThis.__articleHandlerExecuted = true">

[危险链接](javascript:globalThis.__articleScriptExecuted=true)`

    const { container } = render(<TranslationView markdown={attack} />)

    await waitFor(() => expect(screen.getByRole('heading', { name: '安全标题' })).toBeInTheDocument())
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror], [onclick]')).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    expect((globalThis as Record<string, unknown>).__articleScriptExecuted).toBeUndefined()
    expect((globalThis as Record<string, unknown>).__articleHandlerExecuted).toBeUndefined()
  })
})

const productionArtifacts = import.meta.glob('../../dist/**/*.{js,html,json,map}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

describe('生产构建产物安全', () => {
  it('不包含密钥、测试固件、源码映射或远程可执行脚本', () => {
    const entries = Object.entries(productionArtifacts)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some(([path]) => path.endsWith('.map'))).toBe(false)

    const output = entries.map(([path, content]) => `${path}\n${content}`).join('\n')
    expect(output).not.toContain(TEST_API_KEY)
    expect(output).not.toContain('article-standard.html')
    expect(output).not.toContain('How to Build Reliable AI Systems')
    expect(output).not.toMatch(/<script[^>]+src=["']https?:\/\//i)

    const manifestEntry = entries.find(([path]) => path.endsWith('/manifest.json'))
    expect(manifestEntry).toBeDefined()
    const manifest = JSON.parse(manifestEntry![1]) as {
      manifest_version: number
      permissions: string[]
      host_permissions: string[]
      content_security_policy: { extension_pages: string }
    }
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toEqual(['activeTab', 'sidePanel', 'storage'])
    expect(manifest.host_permissions).toEqual(['https://dashscope.aliyuncs.com/*'])
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    )
  })
})
