import type { ExtractedArticle } from '../shared/contracts/article'
import type { ModelSettings } from '../shared/contracts/settings'
import {
  TRANSLATION_RESULT_VERSION,
  type TranslationResult,
} from '../shared/contracts/translation'
import { saveResult } from '../storage/result-repository'
import {
  DEFAULT_CHUNK_LIMITS,
  shouldChunk,
  splitMarkdownChunks,
  type ChunkLimits,
} from './chunking'
import { validateTranslationOutput } from './output-validator'
import { buildChunkedMessages } from './prompt-policy'
import type { TranslationProvider, TranslationRequest } from './providers/translation-provider'

export interface OrchestratorRequest {
  article: ExtractedArticle
  settings: ModelSettings
  signal: AbortSignal
  onSnapshot: (markdown: string) => void
  shouldCommit?: () => boolean
  onCommit?: () => void
  chunkLimits?: ChunkLimits
}

function joinParts(completed: string[], current: string): string {
  if (completed.length === 0) {
    return current
  }
  return completed.join('\n\n') + '\n\n' + current
}

export class TranslationOrchestrator {
  constructor(
    private readonly provider: TranslationProvider,
    private readonly persistResult: (
      result: TranslationResult,
      shouldCommit: () => boolean,
      onCommit: () => void,
    ) => Promise<void> = saveResult,
  ) { }

  async translate(request: OrchestratorRequest): Promise<TranslationResult | null> {
    const limits = request.chunkLimits ?? DEFAULT_CHUNK_LIMITS
    const chunks = shouldChunk(request.article.markdown, limits)
      ? splitMarkdownChunks(request.article.markdown, limits)
      : [request.article.markdown]
    const messageSets = buildChunkedMessages(request.article, chunks)

    const parts: string[] = []
    for (let index = 0; index < chunks.length; index += 1) {
      const chunkRequest: TranslationRequest = {
        settings: request.settings,
        article: request.article,
        signal: request.signal,
        messages: messageSets[index],
      }
      let chunkMarkdown = ''

      try {
        for await (const piece of this.provider.translate(chunkRequest)) {
          if (request.signal.aborted) {
            return null
          }
          chunkMarkdown += piece
          request.onSnapshot(joinParts(parts, chunkMarkdown))
        }
      } catch (error) {
        if (request.signal.aborted) {
          return null
        }
        throw error
      }

      if (request.signal.aborted) {
        return null
      }
      parts.push(chunkMarkdown)
    }

    const markdown = parts.join('\n\n')
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
    let committed = false
    await this.persistResult(result, shouldCommit, () => {
      committed = true
      request.onCommit?.()
    })
    return committed ? result : null
  }
}
