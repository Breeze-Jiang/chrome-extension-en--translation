import type { ExtractedArticle } from '../shared/contracts/article'
import { AppError } from '../shared/errors/app-error'

export interface ValidatedTranslationOutput {
  title: string
  markdown: string
}

function invalidOutput(): never {
  throw new AppError('INVALID_OUTPUT', '翻译结果结构不完整或原文内容被破坏。')
}

function collectMatches(markdown: string, pattern: RegExp): string[] {
  return [...markdown.matchAll(pattern)].map((match) => match[1])
}

function collectCodeBlocks(markdown: string): string[] {
  return collectMatches(markdown, /```[^\n]*\n([\s\S]*?)```/g)
}

function collectInlineTargets(markdown: string, images: boolean): string[] {
  const targets: string[] = []
  const pattern = /(!?)\[[^\]]*\]\(/g
  for (const match of markdown.matchAll(pattern)) {
    if ((match[1] === '!') !== images || match.index === undefined) {
      continue
    }
    const start = match.index + match[0].length
    let nestedParentheses = 0
    let escaped = false
    let end = start
    for (; end < markdown.length; end += 1) {
      const character = markdown[end]
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '(') {
        nestedParentheses += 1
      } else if (character === ')') {
        if (nestedParentheses === 0) {
          break
        }
        nestedParentheses -= 1
      } else if (/\s/.test(character) && nestedParentheses === 0) {
        break
      }
    }
    if (end > start) {
      targets.push(markdown.slice(start, end))
    }
  }
  return targets
}

function collectImageTargets(markdown: string): string[] {
  return collectInlineTargets(markdown, true)
}

function collectLinkTargets(markdown: string): string[] {
  return collectInlineTargets(markdown, false)
}

function containsInOrder(markdown: string, values: string[]): boolean {
  let offset = 0
  for (const value of values) {
    const index = markdown.indexOf(value, offset)
    if (index < 0) {
      return false
    }
    offset = index + value.length
  }
  return true
}

export function validateTranslationOutput(
  markdown: string,
  article: ExtractedArticle,
): ValidatedTranslationOutput {
  const titleMatch = markdown.match(/^#\s+(.+)$/m)
  const authorMarker = `> **作者**：${article.author || '（无）'}`
  const sourceMarker = `> **原文链接**：${article.url}`
  const titleIndex = titleMatch?.index ?? -1
  const authorIndex = markdown.indexOf(authorMarker)
  const sourceIndex = markdown.indexOf(sourceMarker)
  const body = sourceIndex < 0 ? '' : markdown.slice(sourceIndex + sourceMarker.length).trim()

  if (
    !titleMatch ||
    titleIndex !== 0 ||
    authorIndex <= titleIndex ||
    sourceIndex <= authorIndex ||
    body.length === 0
  ) {
    invalidOutput()
  }

  const protectedSequences = [
    collectImageTargets(article.markdown),
    collectLinkTargets(article.markdown),
    collectCodeBlocks(article.markdown),
  ]
  if (protectedSequences.some((values) => !containsInOrder(markdown, values))) {
    invalidOutput()
  }

  return { title: titleMatch[1].trim(), markdown }
}
