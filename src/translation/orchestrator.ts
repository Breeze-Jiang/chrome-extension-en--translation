import type { ExtractedArticle } from '../shared/contracts/article'
import type { ModelSettings } from '../shared/contracts/settings'
import {
  TRANSLATION_RESULT_VERSION,
  type TranslationResult,
} from '../shared/contracts/translation'
import { saveResult } from '../storage/result-repository'
import { validateTranslationOutput } from './output-validator'
import type { TranslationProvider } from './providers/translation-provider'

export interface OrchestratorRequest {
  article: ExtractedArticle
  settings: ModelSettings
  signal: AbortSignal
  onSnapshot: (markdown: string) => void
  shouldCommit?: () => boolean
}

export class TranslationOrchestrator {
  constructor(
    private readonly provider: TranslationProvider,
    private readonly persistResult: (
      result: TranslationResult,
      shouldCommit: () => boolean,
    ) => Promise<void> = saveResult,
  ) { }

  async translate(request: OrchestratorRequest): Promise<TranslationResult | null> {
    let markdown = ''

    for await (const chunk of this.provider.translate(request)) {
      if (request.signal.aborted) {
        return null
      }
      markdown += chunk
      request.onSnapshot(markdown)
    }

    if (request.signal.aborted) {
      return null
    }
    const output = validateTranslationOutput(markdown, request.article)
    const result: TranslationResult = {
      version: TRANSLATION_RESULT_VERSION,
      sourceUrl: request.article.url,
      title: output.title,
      author: request.article.author,
      markdown: output.markdown,
      completedAt: new Date().toISOString(),
      model: request.settings.model,
    }
    const shouldCommit = request.shouldCommit ?? (() => !request.signal.aborted)
    await this.persistResult(result, shouldCommit)
    return shouldCommit() ? result : null
  }
}
