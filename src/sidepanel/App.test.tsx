import { fireEvent, render, screen } from '@testing-library/react'
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
})

describe('侧边栏空闲状态', () => {
  it('渲染顶部栏、当前网页摘要和一键翻译按钮', async () => {
    render(<App state={{ kind: 'idle' }} />)

    expect(screen.getByText('网页翻译')).toBeInTheDocument()
    expect(await screen.findByText('How to Build Reliable AI Systems')).toBeInTheDocument()
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '一键翻译当前网页' })).toBeEnabled()
  })

  it('受限页面禁用翻译按钮并显示不支持当前页面', async () => {
    mockedRequestActiveTab.mockResolvedValue(restrictedTab)
    render(<App state={{ kind: 'idle' }} />)

    expect(await screen.findByText('不支持当前页面')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '一键翻译当前网页' })).toBeDisabled()
  })

  it('读取标签页失败时禁用按钮并提示无法读取', async () => {
    mockedRequestActiveTab.mockRejectedValue(new Error('boom'))
    render(<App state={{ kind: 'idle' }} />)

    expect(await screen.findByText('无法读取当前网页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '一键翻译当前网页' })).toBeDisabled()
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

    fireEvent.click(await screen.findByRole('button', { name: '一键翻译当前网页' }))

    await vi.waitFor(() => expect(dependencies.openSettings).toHaveBeenCalledTimes(1))
    expect(dependencies.extractArticle).not.toHaveBeenCalled()
    expect(screen.queryByText('提取预览')).not.toBeInTheDocument()
  })

  it('显示正在提取文章，且不出现翻译按钮', async () => {
    render(<App state={{ kind: 'extracting' }} />)

    expect(await screen.findByText('正在提取文章')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '一键翻译当前网页' })).not.toBeInTheDocument()
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
})

describe('侧边栏失败与取消状态', () => {
  it('失败状态显示翻译未完成、重试和打开设置', async () => {
    render(<App state={{ kind: 'failed', errorCode: 'NETWORK_ERROR' }} />)

    expect(await screen.findByText('翻译未完成，请重试或检查设置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开设置' })).toBeInTheDocument()
  })

  it('取消状态显示已取消和重试', async () => {
    render(<App state={{ kind: 'cancelled' }} />)

    expect(await screen.findByText('翻译已取消')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
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
