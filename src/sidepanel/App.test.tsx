import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TranslationState } from '../shared/contracts/translation'
import { requestActiveTab } from '../shared/messaging/client'
import type { ActiveTabInfo } from '../shared/messaging/messages'
import type { TranslationSessionDependencies } from './hooks/use-translation-session'

import { App } from './App'

vi.mock('md-wx', () => ({
  MarkdownRenderer: ({
    markdown,
    showSettings,
    enableCopy,
    enableThemeSwitch,
    enableViewModeToggle,
  }: {
    markdown?: string
    showSettings?: boolean
    enableCopy?: boolean
    enableThemeSwitch?: boolean
    enableViewModeToggle?: boolean
  }) => (
    <div
      data-testid="markdown-renderer"
      data-show-settings={String(showSettings)}
      data-enable-copy={String(enableCopy)}
      data-enable-theme-switch={String(enableThemeSwitch)}
      data-enable-view-mode-toggle={String(enableViewModeToggle)}
    >
      {markdown}
    </div>
  ),
}))

vi.mock('../shared/messaging/client', () => ({
  extractArticle: vi.fn(),
  requestActiveTab: vi.fn(),
}))

const mockedRequestActiveTab = vi.mocked(requestActiveTab)
type TabUpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0]
const tabActivatedListeners = new Set<() => void>()
const tabUpdatedListeners = new Set<TabUpdatedListener>()

const processableTab: ActiveTabInfo = {
  tabId: 12,
  title: 'How to Build Reliable AI Systems',
  url: 'https://example.com/article',
  domain: 'example.com',
  processable: true,
  reason: null,
}

const restrictedTab: ActiveTabInfo = {
  tabId: 12,
  title: 'New Tab',
  url: 'chrome://newtab/',
  domain: '',
  processable: false,
  reason: 'PAGE_RESTRICTED',
}

const completedState: TranslationState = {
  kind: 'completed',
  result: {
    version: 1,
    sourceUrl: 'https://example.com/article',
    title: '如何构建可靠的 AI 系统',
    author: 'Jane Doe',
    markdown: '# 如何构建可靠的 AI 系统\n\n译文正文。',
    completedAt: '2026-08-21T10:05:00.000Z',
    model: 'qwen-plus',
  },
}

beforeEach(() => {
  mockedRequestActiveTab.mockReset()
  mockedRequestActiveTab.mockResolvedValue(processableTab)
  tabActivatedListeners.clear()
  tabUpdatedListeners.clear()
  vi.stubGlobal('chrome', {
    tabs: {
      onActivated: {
        addListener: (listener: () => void) => tabActivatedListeners.add(listener),
        removeListener: (listener: () => void) => tabActivatedListeners.delete(listener),
      },
      onUpdated: {
        addListener: (listener: TabUpdatedListener) => tabUpdatedListeners.add(listener),
        removeListener: (listener: TabUpdatedListener) => tabUpdatedListeners.delete(listener),
      },
    },
  })
})

describe('侧边栏空闲状态', () => {
  it('渲染中文顶部栏、当前网页摘要和翻译按钮', async () => {
    render(<App state={{ kind: 'idle' }} />)

    expect(screen.getByText('英文网页翻译')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型切换设置' })).toBeInTheDocument()
    expect(screen.getByText('已识别当前网页')).toBeInTheDocument()
    expect(screen.getByText('原文标题')).toBeInTheDocument()
    expect(await screen.findByText('How to Build Reliable AI Systems')).toBeInTheDocument()
    expect(screen.getByText('来源网站：example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始翻译为中文' })).toBeEnabled()
  })

  it('受限页面禁用翻译按钮并显示不支持当前页面', async () => {
    mockedRequestActiveTab.mockResolvedValue(restrictedTab)
    render(<App state={{ kind: 'idle' }} />)

    expect(await screen.findByText('不支持当前页面')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始翻译为中文' })).toBeDisabled()
  })

  it('读取标签页失败时禁用按钮并提示无法读取', async () => {
    mockedRequestActiveTab.mockRejectedValue(new Error('boom'))
    render(<App state={{ kind: 'idle' }} />)

    expect(await screen.findByText('无法读取当前网页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始翻译为中文' })).toBeDisabled()
  })

  it('活动标签页从受限页面切换到文章页后刷新可处理状态', async () => {
    mockedRequestActiveTab
      .mockResolvedValueOnce(restrictedTab)
      .mockResolvedValueOnce(processableTab)
    render(<App state={{ kind: 'idle' }} />)

    expect(await screen.findByText('不支持当前页面')).toBeInTheDocument()
    await act(async () => {
      tabActivatedListeners.forEach((listener) => listener())
    })

    expect(await screen.findByText('How to Build Reliable AI Systems')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始翻译为中文' })).toBeEnabled()
  })
})

describe('侧边栏提取状态', () => {
  it('点击主按钮先检查配置，缺失时打开设置且不提取', async () => {
    const dependencies: TranslationSessionDependencies = {
      readSettings: vi.fn().mockResolvedValue(null),
      readResult: vi.fn().mockResolvedValue(null),
      saveResult: vi.fn().mockResolvedValue(undefined),
      extractArticle: vi.fn(),
      openSettings: vi.fn().mockResolvedValue(undefined),
      provider: { translate: vi.fn() },
      refreshIntervalMs: 10,
    }
    render(<App sessionDependencies={dependencies} />)

    fireEvent.click(await screen.findByRole('button', { name: '开始翻译为中文' }))

    await vi.waitFor(() => expect(dependencies.openSettings).toHaveBeenCalledTimes(1))
    expect(dependencies.extractArticle).not.toHaveBeenCalled()
    expect(screen.queryByText('提取预览')).not.toBeInTheDocument()
  })

  it('显示正在提取文章，且不出现翻译按钮', async () => {
    render(<App state={{ kind: 'extracting' }} />)

    expect(await screen.findByText('正在提取文章')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始翻译为中文' })).not.toBeInTheDocument()
  })
})

describe('侧边栏翻译状态', () => {
  it('显示正在翻译、取消按钮，并将 Markdown 传入渲染器', async () => {
    render(<App state={{ kind: 'translating' }} markdown="# 标题\n\n正文" />)

    expect(await screen.findByText('正在翻译')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消翻译' })).toBeInTheDocument()

    const renderer = screen.getByTestId('markdown-renderer')
    expect(renderer).toHaveTextContent('# 标题')
    expect(renderer).toHaveTextContent('正文')
  })
})

describe('侧边栏完成状态', () => {
  it('显示翻译完成、下载与重新翻译按钮', async () => {
    render(<App state={completedState} />)

    expect(await screen.findByText('翻译完成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新翻译' })).toBeInTheDocument()
  })

  it('点击下载按钮时下载当前完整成功译文', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:markdown-download')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<App state={completedState} />)

    fireEvent.click(await screen.findByRole('button', { name: '下载 Markdown' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)))
      reader.readAsText(blob, 'UTF-8')
    })
    expect(content).toBe(completedState.result.markdown)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:markdown-download')
  })
})

describe('侧边栏失败与取消状态', () => {
  it('网络错误显示翻译未完成、错误文案和重试，不显示打开设置', async () => {
    render(<App state={{ kind: 'failed', errorCode: 'NETWORK_ERROR' }} />)

    expect(await screen.findByText('翻译未完成')).toBeInTheDocument()
    expect(screen.getByText('无法连接模型服务，请检查网络后重试。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开设置' })).not.toBeInTheDocument()
  })

  it('鉴权错误显示打开设置，不显示重试', async () => {
    render(<App state={{ kind: 'failed', errorCode: 'AUTH_ERROR' }} />)

    expect(await screen.findByText('翻译未完成')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开设置' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('提取失败不提供重试或打开设置按钮', async () => {
    render(<App state={{ kind: 'failed', errorCode: 'EXTRACTION_FAILED' }} />)

    expect(await screen.findByText('无法识别当前页面的主要文章内容。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开设置' })).not.toBeInTheDocument()
  })

  it('失败状态提示上一次成功结果未被覆盖', async () => {
    render(<App state={{ kind: 'failed', errorCode: 'NETWORK_ERROR' }} />)

    expect(await screen.findByText('上一次成功结果未被覆盖。')).toBeInTheDocument()
  })

  it('取消状态显示已取消、重试和未覆盖提示', async () => {
    render(<App state={{ kind: 'cancelled' }} />)

    expect(await screen.findByText('翻译已取消')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.getByText('上一次成功结果未被覆盖。')).toBeInTheDocument()
  })
})

describe('MarkdownRenderer 关闭非核心能力', () => {
  it('关闭设置面板、复制、主题切换和视图切换', async () => {
    render(<App state={{ kind: 'translating' }} markdown="正文" />)

    const renderer = await screen.findByTestId('markdown-renderer')
    expect(renderer.getAttribute('data-show-settings')).toBe('false')
    expect(renderer.getAttribute('data-enable-copy')).toBe('false')
    expect(renderer.getAttribute('data-enable-theme-switch')).toBe('false')
    expect(renderer.getAttribute('data-enable-view-mode-toggle')).toBe('false')
  })
})
