import { useEffect, useRef, useState } from 'react'

import type { ExtractedArticle } from '../../shared/contracts/article'
import type { ModelSettings } from '../../shared/contracts/settings'
import type { TranslationResult, TranslationState } from '../../shared/contracts/translation'
import type { AppErrorCode } from '../../shared/errors/app-error'
import { isAppError } from '../../shared/errors/app-error'
import { extractArticle } from '../../shared/messaging/client'
import { readResult, saveResult } from '../../storage/result-repository'
import { readSettings } from '../../storage/settings-repository'
import { TranslationOrchestrator } from '../../translation/orchestrator'
import { OpenAICompatibleProvider } from '../../translation/providers/openai-compatible'
import type { TranslationProvider } from '../../translation/providers/translation-provider'

const STREAM_REFRESH_INTERVAL_MS = 50

export interface TranslationSessionDependencies {
  readSettings: () => Promise<ModelSettings | null>
  readResult: () => Promise<TranslationResult | null>
  saveResult: (
    result: TranslationResult,
    shouldCommit: () => boolean,
    onCommit: () => void,
  ) => Promise<void>
  extractArticle: (tabId: number, url: string) => Promise<ExtractedArticle>
  openSettings: () => Promise<void>
  provider: TranslationProvider
  refreshIntervalMs: number
}

interface TranslationSession {
  state: TranslationState
  markdown: string
  restoreError: AppErrorCode | null
  start: (tabId: number, url: string) => void
  cancel: () => void
  retry: (tabId: number, url: string) => void
}

const defaultDependencies: TranslationSessionDependencies = {
  readSettings,
  readResult,
  saveResult,
  extractArticle,
  openSettings: () => chrome.runtime.openOptionsPage(),
  provider: new OpenAICompatibleProvider(),
  refreshIntervalMs: STREAM_REFRESH_INTERVAL_MS,
}

export function useTranslationSession(
  dependencies: TranslationSessionDependencies = defaultDependencies,
): TranslationSession {
  const [state, setState] = useState<TranslationState>({ kind: 'idle' })
  const [markdown, setMarkdown] = useState('')
  const [restoreError, setRestoreError] = useState<AppErrorCode | null>(null)
  const activeRequest = useRef(0)
  const activeController = useRef<AbortController | null>(null)
  const running = useRef(false)
  const cancellable = useRef(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMarkdown = useRef('')

  function clearRefreshTimer() {
    if (refreshTimer.current !== null) {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
    }
  }

  function publishPending(request: number) {
    clearRefreshTimer()
    if (activeRequest.current === request) {
      setMarkdown(pendingMarkdown.current)
    }
  }

  function scheduleSnapshot(snapshot: string, request: number) {
    if (activeRequest.current !== request) {
      return
    }
    pendingMarkdown.current = snapshot
    setState((current) => current.kind === 'extracting' ? { kind: 'translating' } : current)
    if (refreshTimer.current === null) {
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        publishPending(request)
      }, dependencies.refreshIntervalMs)
    }
  }

  async function run(tabId: number, url: string, request: number, controller: AbortController) {
    try {
      const settings = await dependencies.readSettings()
      if (activeRequest.current !== request || controller.signal.aborted) {
        return
      }
      if (!settings) {
        running.current = false
        setState({ kind: 'idle' })
        await dependencies.openSettings()
        return
      }

      const article = await dependencies.extractArticle(tabId, url)
      if (activeRequest.current !== request || controller.signal.aborted) {
        return
      }

      const orchestrator = new TranslationOrchestrator(
        dependencies.provider,
        dependencies.saveResult,
      )
      const output = await orchestrator.translate({
        article,
        settings,
        signal: controller.signal,
        onSnapshot: (snapshot) => scheduleSnapshot(snapshot, request),
        shouldCommit: () => (
          activeRequest.current === request && !controller.signal.aborted
        ),
        onCommit: () => { cancellable.current = false },
      })
      if (activeRequest.current !== request || controller.signal.aborted || output === null) {
        return
      }

      publishPending(request)
      running.current = false
      setState({ kind: 'completed', result: output })
    } catch (error: unknown) {
      if (activeRequest.current !== request || controller.signal.aborted) {
        return
      }
      clearRefreshTimer()
      running.current = false
      setState({
        kind: 'failed',
        errorCode: isAppError(error) ? error.code : 'NETWORK_ERROR',
      })
    }
  }

  function start(tabId: number, url: string) {
    // 新请求开始前取消旧请求并递增请求 ID，保证旧请求迟到结果被丢弃。
    activeController.current?.abort()
    activeRequest.current += 1
    running.current = true
    cancellable.current = true
    const request = activeRequest.current
    const controller = new AbortController()
    activeController.current = controller
    clearRefreshTimer()
    pendingMarkdown.current = ''
    setMarkdown('')
    setState({ kind: 'extracting' })
    void run(tabId, url, request, controller)
  }

  function cancel() {
    if (!running.current || !cancellable.current) {
      return
    }
    running.current = false
    activeRequest.current += 1
    activeController.current?.abort()
    clearRefreshTimer()
    setState({ kind: 'cancelled' })
  }

  useEffect(() => {
    let disposed = false
    dependencies.readResult()
      .then((result) => {
        if (!disposed && result && activeRequest.current === 0) {
          setMarkdown(result.markdown)
          setState({ kind: 'completed', result })
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setRestoreError(isAppError(error) ? error.code : 'STORAGE_FAILED')
        }
      })
    return () => {
      disposed = true
      activeRequest.current += 1
      activeController.current?.abort()
      clearRefreshTimer()
    }
  }, [dependencies])

  return { state, markdown, restoreError, start, cancel, retry: start }
}
