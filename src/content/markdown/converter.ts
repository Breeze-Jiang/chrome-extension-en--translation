import { gfm } from '@joplin/turndown-plugin-gfm'
import TurndownService from 'turndown'

import {
  ARTICLE_CONTRACT_VERSION,
  type ExtractedArticle,
} from '../../shared/contracts/article'
import type { ExtractionCandidate } from '../extractors/extractor'
import { evaluateQuality } from '../extractors/quality-evaluator'
import { normalizeImages } from '../normalization/images'
import { normalizeLinks } from '../normalization/links'
import { extractDomain } from '../normalization/metadata'

/** 在转换前从正文中移除脚本、样式、表单控件。 */
const REMOVE_SELECTORS = 'script, style, form, input, button, textarea, select, dialog'

function parseRoot(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body
}

/** 移除脚本、样式、表单控件和事件属性，避免进入 Markdown 输出。 */
function cleanRoot(root: HTMLElement): void {
  root.querySelectorAll(REMOVE_SELECTORS).forEach((node) => node.remove())
  root.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith('on')) {
        element.removeAttribute(attr.name)
      }
    })
  })
}

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  service.use(gfm)
  // 严格输出 `![alt](src)`，不附加 title。
  service.addRule('articleImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const alt = node.getAttribute('alt') || ''
      const src = node.getAttribute('src') || ''
      return src ? `![${alt}](${src})` : ''
    },
  })
  return service
}

/** 将正文 HTML 转换为标准 Markdown，规范化相对链接和图片地址。 */
export function convertHtmlToMarkdown(html: string, url: string): string {
  const root = parseRoot(html)
  cleanRoot(root)
  normalizeImages(root, url)
  normalizeLinks(root, url)
  return createTurndown().turndown(root)
}

/** 将内部提取候选组装为标准化文章契约，正文为转换后的 Markdown。 */
export function buildArticle(candidate: ExtractionCandidate, url: string): ExtractedArticle {
  return {
    version: ARTICLE_CONTRACT_VERSION,
    url,
    title: candidate.title,
    author: candidate.author,
    language: candidate.language,
    siteName: candidate.siteName || extractDomain(url),
    markdown: convertHtmlToMarkdown(candidate.content, url),
    charCount: candidate.charCount,
    extractor: candidate.extractor,
    qualityScore: evaluateQuality(candidate),
    extractedAt: new Date().toISOString(),
  }
}
