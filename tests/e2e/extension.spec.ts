import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'

const extensionPath = path.resolve('dist')
const articleUrl = 'https://example.com/e2e/article'
const articleHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>How to Build Reliable AI Systems</title>
  <meta name="author" content="Jane Doe">
</head>
<body>
  <article>
    <h1>How to Build Reliable AI Systems</h1>
    <p>Reliable AI systems require clear boundaries between components so failures can be localized and corrected quickly.</p>
    <p>Observability explains how a production system behaves under real traffic and changing operating conditions.</p>
    <p>Repeatable validation ensures every release is checked against a stable and trustworthy quality baseline.</p>
    <p>Graceful degradation keeps the product useful when an individual dependency becomes temporarily unavailable.</p>
    <p>Together these engineering practices create dependable machine learning products for everyday users.</p>
  </article>
</body>
</html>`

async function launchExtension(): Promise<{ context: BrowserContext; extensionId: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })
  let worker = context.serviceWorkers()[0]
  worker ??= await context.waitForEvent('serviceworker')
  return { context, extensionId: new URL(worker.url()).host }
}

async function saveModelSettings(context: BrowserContext, extensionId: string): Promise<void> {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await options.evaluate(async () => {
    await chrome.storage.local.set({
      modelSettings: {
        version: 1,
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'e2e-mock-key',
        model: 'qwen-plus',
      },
    })
  })
  await options.close()
}

async function openArticleAndSidepanel(
  context: BrowserContext,
  extensionId: string,
): Promise<{ article: Page; sidepanel: Page }> {
  await context.route(articleUrl, (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: articleHtml,
  }))
  const article = await context.newPage()
  await article.goto(articleUrl)
  await context.addInitScript(({ url }) => {
    if (!globalThis.chrome?.runtime?.sendMessage) return
    const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)
    chrome.runtime.sendMessage = async (...args: Parameters<typeof chrome.runtime.sendMessage>) => {
      const message = args[0] as { type?: string; requestId?: string } | undefined
      if (message?.type === 'GET_ACTIVE_TAB_REQUEST') {
        return {
          type: 'GET_ACTIVE_TAB_RESPONSE',
          protocolVersion: 1,
          requestId: message.requestId,
          tab: {
            tabId: 101,
            title: 'How to Build Reliable AI Systems',
            url,
            domain: 'example.com',
            processable: true,
            reason: null,
          },
        }
      }
      if (message?.type === 'EXTRACT_ARTICLE_REQUEST') {
        return {
          type: 'EXTRACT_ARTICLE_SUCCESS',
          protocolVersion: 1,
          requestId: message.requestId,
          article: {
            version: 1,
            url,
            title: 'How to Build Reliable AI Systems',
            author: 'Jane Doe',
            language: 'en',
            siteName: 'Example',
            markdown: '# How to Build Reliable AI Systems\n\nReliable systems need clear boundaries.\n\nObservability and repeatable validation protect release quality.',
            charCount: 128,
            extractor: 'defuddle',
            qualityScore: 90,
            extractedAt: new Date().toISOString(),
          },
        }
      }
      return sendMessage(...args)
    }
  }, { url: articleUrl })
  const sidepanel = await context.newPage()
  await sidepanel.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await expect(sidepanel.getByRole('button', { name: '一键翻译当前网页' })).toBeEnabled()
  return { article, sidepanel }
}

async function installMockTranslationStream(
  context: BrowserContext,
  chunks: string[],
  delayMs: number,
): Promise<void> {
  await context.addInitScript(({ streamChunks, streamDelay }) => {
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.endsWith('/chat/completions')) {
        return originalFetch(input, init)
      }

      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
      const encoder = new TextEncoder()
      let timer: ReturnType<typeof setTimeout> | undefined
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let index = 0
          const push = () => {
            if (signal?.aborted) {
              controller.error(new DOMException('Aborted', 'AbortError'))
              return
            }
            if (index >= streamChunks.length) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              return
            }
            const data = JSON.stringify({
              choices: [{ delta: { content: streamChunks[index] } }],
            })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            index += 1
            timer = setTimeout(push, streamDelay)
          }
          timer = setTimeout(push, streamDelay)
          signal?.addEventListener('abort', () => {
            if (timer !== undefined) clearTimeout(timer)
            controller.error(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        },
        cancel() {
          if (timer !== undefined) clearTimeout(timer)
        },
      })

      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      })
    }
  }, { streamChunks: chunks, streamDelay: delayMs })
}

test('生产扩展可加载，设置页可安全保存并恢复配置', async () => {
  const { context, extensionId } = await launchExtension()
  try {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    await expect(page.getByRole('heading', { name: '模型设置' })).toBeVisible()
    const apiKey = page.getByRole('textbox', { name: 'API Key' })
    await expect(apiKey).toHaveAttribute('type', 'password')

    await page.getByLabel('OpenAI 兼容服务地址').fill(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
    await apiKey.fill('e2e-local-only-key')
    await page.getByLabel('模型名称').fill('qwen-plus')
    await page.getByRole('button', { name: '保存设置' }).click()
    await expect(page.getByRole('status')).toHaveText('设置已保存')

    const stored = await page.evaluate(async () => chrome.storage.local.get(null))
    expect(JSON.stringify(stored)).toContain('qwen-plus')
    expect(page.url()).not.toContain('e2e-local-only-key')

    await page.reload()
    await expect(page.getByRole('textbox', { name: 'API Key' })).toHaveAttribute(
      'type',
      'password',
    )
    await expect(page.getByLabel('模型名称')).toHaveValue('qwen-plus')
  } finally {
    await context.close()
  }
})

test('侧边栏完成流式翻译、下载并恢复最近结果', async () => {
  const { context, extensionId } = await launchExtension()
  const translatedMarkdown = `# 构建可靠的 AI 系统\n\n> **作者**：Jane Doe\n> **原文链接**：${articleUrl}\n\n可靠的系统需要清晰边界。\n\n可观测性和可重复验证共同保证发布质量。`
  try {
    await installMockTranslationStream(context, [
      '# 构建可靠的 AI 系统\n\n',
      `> **作者**：Jane Doe\n> **原文链接**：${articleUrl}\n\n`,
      '可靠的系统需要清晰边界。\n\n',
      '可观测性和可重复验证共同保证发布质量。',
    ], 150)
    await saveModelSettings(context, extensionId)
    const { sidepanel } = await openArticleAndSidepanel(context, extensionId)

    await sidepanel.getByRole('button', { name: '一键翻译当前网页' }).click()
    await expect(sidepanel.getByRole('status')).toContainText('正在提取文章')
    await expect(sidepanel.getByRole('status')).toContainText('正在翻译')
    await expect(sidepanel.getByRole('heading', { name: '构建可靠的 AI 系统' })).toBeVisible()
    await expect(sidepanel.getByText('可靠的系统需要清晰边界。')).toBeVisible()
    await expect(sidepanel.getByRole('status')).toContainText('翻译完成')

    const stored = await sidepanel.evaluate(async () => chrome.storage.local.get('latestTranslationResult'))
    expect(stored.latestTranslationResult.markdown).toBe(translatedMarkdown)
    expect(JSON.stringify(stored.latestTranslationResult)).not.toContain('e2e-mock-key')

    const downloadPromise = sidepanel.waitForEvent('download')
    await sidepanel.getByRole('button', { name: '下载 Markdown' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('构建可靠的 AI 系统.md')
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    const content = await import('node:fs/promises').then((fs) => fs.readFile(downloadPath!, 'utf8'))
    expect(content).toBe(translatedMarkdown)

    await sidepanel.close()
    const restored = await context.newPage()
    await restored.goto(`chrome-extension://${extensionId}/sidepanel.html`)
    await expect(restored.getByRole('status')).toContainText('翻译完成')
    await expect(restored.getByRole('heading', { name: '构建可靠的 AI 系统' })).toBeVisible()
    await expect(restored.getByRole('button', { name: '下载 Markdown' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('取消流式翻译后不显示迟到内容且不保存部分结果', async () => {
  const { context, extensionId } = await launchExtension()
  try {
    await installMockTranslationStream(context, [
      '# 尚未完成的译文\n\n',
      `> **作者**：Jane Doe\n> **原文链接**：${articleUrl}\n\n`,
      '这段迟到内容不应显示。',
    ], 400)
    await saveModelSettings(context, extensionId)
    const { sidepanel } = await openArticleAndSidepanel(context, extensionId)

    await sidepanel.getByRole('button', { name: '一键翻译当前网页' }).click()
    await expect(sidepanel.getByRole('status')).toContainText('正在翻译')
    await expect(sidepanel.getByRole('heading', { name: '尚未完成的译文' })).toBeVisible()
    await sidepanel.getByRole('button', { name: '取消翻译' }).click()

    await expect(
      sidepanel.getByRole('status').filter({ hasText: '翻译已取消' }),
    ).toBeVisible()
    await sidepanel.waitForTimeout(1_000)
    await expect(sidepanel.getByText('这段迟到内容不应显示。')).toHaveCount(0)
    await expect(sidepanel.getByRole('button', { name: '下载 Markdown' })).toHaveCount(0)
    const stored = await sidepanel.evaluate(async () => chrome.storage.local.get('latestTranslationResult'))
    expect(stored.latestTranslationResult).toBeUndefined()
  } finally {
    await context.close()
  }
})

test('侧边栏生产入口可读取真实标签页并拒绝受限页面', async () => {
  const { context, extensionId } = await launchExtension()
  try {
    const restrictedPage = await context.newPage()
    await restrictedPage.goto('chrome://version/')
    const sidepanel = await context.newPage()
    await sidepanel.goto(`chrome-extension://${extensionId}/sidepanel.html`)

    await expect(sidepanel.getByRole('button', { name: '一键翻译当前网页' })).toBeDisabled()
    await expect(sidepanel.getByRole('heading', { name: '不支持当前页面' })).toBeVisible()
    await expect(sidepanel.getByRole('button', { name: '下载 Markdown' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
