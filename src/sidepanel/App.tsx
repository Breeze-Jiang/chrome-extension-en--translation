import { useEffect, useState } from 'react'

import type { TranslationState } from '../shared/contracts/translation'
import { requestActiveTab } from '../shared/messaging/client'
import type { ActiveTabInfo } from '../shared/messaging/messages'

import { ActionBar } from './components/ActionBar'
import { HeaderBar } from './components/HeaderBar'
import { PageSummary } from './components/PageSummary'
import { StatusPanel } from './components/StatusPanel'
import { TranslationView } from './components/TranslationView'
import { createMarkdownDownload } from './download/create-markdown-download'
import {
  useTranslationSession,
  type TranslationSessionDependencies,
} from './hooks/use-translation-session'

export interface SidePanelAppProps {
  state?: TranslationState
  markdown?: string
  onOpenSettings?: () => void
  onTranslate?: () => void
  onCancel?: () => void
  onRetry?: () => void
  onReTranslate?: () => void
  onDownload?: () => void
  sessionDependencies?: TranslationSessionDependencies
}

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; tab: ActiveTabInfo }
  | { status: 'error' }

const RESTRICTED_TEXT = '不支持当前页面'

/** 侧边栏主页面：空闲态读取并展示真实当前网页，受限页面禁用翻译按钮。 */
export function App({
  state = { kind: 'idle' },
  markdown = '',
  onOpenSettings,
  onTranslate,
  onCancel,
  onRetry,
  onReTranslate,
  onDownload,
  sessionDependencies,
}: SidePanelAppProps) {
  const [page, setPage] = useState<PageState>({ status: 'loading' })
  const session = useTranslationSession(sessionDependencies)
  const isControlled = state.kind !== 'idle' || markdown.length > 0 || onTranslate !== undefined
  const currentState = isControlled ? state : session.state
  const currentMarkdown = isControlled ? markdown : session.markdown

  useEffect(() => {
    let cancelled = false
    requestActiveTab()
      .then((tab) => {
        if (!cancelled) {
          setPage({ status: 'ready', tab })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPage({ status: 'error' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const startSession = () => {
    if (page.status === 'ready') {
      session.start(page.tab.tabId, page.tab.url)
    }
  }
  const retrySession = () => {
    if (page.status === 'ready') {
      session.retry(page.tab.tabId, page.tab.url)
    }
  }
  const downloadResult = () => {
    if (currentState.kind === 'completed') {
      createMarkdownDownload(currentState.result.title, currentState.result.markdown)
    }
  }
  const actionProps = {
    onOpenSettings,
    onTranslate: onTranslate ?? startSession,
    onCancel: onCancel ?? session.cancel,
    onRetry: onRetry ?? retrySession,
    onReTranslate: onReTranslate ?? startSession,
    onDownload: onDownload ?? downloadResult,
  }

  const isProcessable = page.status === 'ready' && page.tab.processable
  const translateDisabled = !isProcessable

  function renderIdleSummary() {
    if (page.status === 'loading') {
      return <PageSummary title="正在读取当前网页…" domain="" />
    }
    if (page.status === 'error') {
      return <PageSummary title="无法读取当前网页" domain="" />
    }
    if (page.tab.processable) {
      return <PageSummary title={page.tab.title || page.tab.domain} domain={page.tab.domain} />
    }
    return <PageSummary title={page.tab.title || RESTRICTED_TEXT} domain="" />
  }

  function renderIdleHint() {
    if (page.status === 'loading') {
      return null
    }
    if (page.status === 'error') {
      return <p className="sidepanel__hint">无法读取当前网页。</p>
    }
    if (page.tab.processable) {
      return <p className="sidepanel__hint">提取正文并翻译为中文，结果仅保存在本地。</p>
    }
    return <p className="sidepanel__hint">{RESTRICTED_TEXT}</p>
  }

  return (
    <div className="sidepanel">
      <HeaderBar onOpenSettings={onOpenSettings} />

      {!isControlled && session.restoreError && (
        <p className="sidepanel__hint" role="status">
          最近译文恢复失败，你仍可开始新翻译。
        </p>
      )}

      {currentState.kind === 'idle' && (
        <>
          {renderIdleSummary()}
          <ActionBar state={currentState} {...actionProps} disabled={translateDisabled} />
          {renderIdleHint()}
        </>
      )}

      {currentState.kind !== 'idle' && <StatusPanel state={currentState} />}

      {currentState.kind === 'extracting' && (
        <ActionBar state={currentState} {...actionProps} />
      )}

      {currentState.kind === 'translating' && (
        <>
          <TranslationView markdown={currentMarkdown} />
          <ActionBar state={currentState} {...actionProps} />
        </>
      )}

      {currentState.kind === 'completed' && (
        <>
          <TranslationView markdown={currentState.result.markdown} />
          <ActionBar state={currentState} {...actionProps} />
        </>
      )}

      {(currentState.kind === 'failed' || currentState.kind === 'cancelled') && (
        <>
          <ActionBar state={currentState} {...actionProps} />
          <p className="sidepanel__hint" role="status">
            上一次成功结果未被覆盖。
          </p>
        </>
      )}
    </div>
  )
}
