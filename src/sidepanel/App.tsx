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
    const refreshActiveTab = () => {
      setPage({ status: 'loading' })
      requestActiveTab()
        .then((tab) => {
          // #region debug-point A-B-C:sidepanel-received-tab
          void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'sidepanel-tab-detection', runId: 'pre-fix', hypothesisId: 'A-B-C', location: 'src/sidepanel/App.tsx:refreshActiveTab', msg: '[DEBUG] Side panel received active tab', data: { tabId: tab.tabId, url: tab.url, title: tab.title, domain: tab.domain, processable: tab.processable, reason: tab.reason }, ts: Date.now() }) }).catch(() => { })
          // #endregion
          if (!cancelled) {
            setPage({ status: 'ready', tab })
          }
        })
        .catch((error) => {
          // #region debug-point B-C:sidepanel-request-failed
          void fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'sidepanel-tab-detection', runId: 'pre-fix', hypothesisId: 'B-C', location: 'src/sidepanel/App.tsx:refreshActiveTab', msg: '[DEBUG] Side panel active-tab request failed', data: { error: String(error) }, ts: Date.now() }) }).catch(() => { })
          // #endregion
          if (!cancelled) {
            setPage({ status: 'error' })
          }
        })
    }
    const handleTabActivated = () => refreshActiveTab()
    const handleTabUpdated: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
      _tabId,
      changeInfo,
    ) => {
      if (changeInfo.status === 'complete' || changeInfo.url !== undefined) {
        refreshActiveTab()
      }
    }

    refreshActiveTab()
    chrome.tabs.onActivated.addListener(handleTabActivated)
    chrome.tabs.onUpdated.addListener(handleTabUpdated)
    return () => {
      cancelled = true
      chrome.tabs.onActivated.removeListener(handleTabActivated)
      chrome.tabs.onUpdated.removeListener(handleTabUpdated)
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
      return <p className="sidepanel__hint">译文仅保存在本机浏览器中，不会覆盖网页原文。</p>
    }
    return <p className="sidepanel__hint">{RESTRICTED_TEXT}</p>
  }

  return (
    <div className={`sidepanel sidepanel--${currentState.kind}`}>
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
