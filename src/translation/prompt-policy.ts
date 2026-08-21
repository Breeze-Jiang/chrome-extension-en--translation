import type { ExtractedArticle } from '../shared/contracts/article'

/** 通用聊天消息，避免 prompt 层直接依赖 OpenAI SDK 类型。 */
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }

/** 翻译系统提示词：固定要求只输出 Markdown，并保留作者、链接、图片和结构。 */
export const TRANSLATION_SYSTEM_PROMPT = [
  '你是专业的英文到中文翻译助手。请将用户提供的英文文章翻译为中文，并只输出最终 Markdown。',
  '',
  '要求：',
  '1. 只输出最终 Markdown，不输出任何解释、前言或代码围栏。',
  '2. 翻译标题和正文；作者名保留原文，不翻译。',
  '3. 保持 Markdown 结构：标题、段落、列表、引用、表格和代码块保持有效。',
  '4. 图片保持 `![alt](src)` 格式，链接目标地址和代码块内容不得修改。',
  '5. 输出顺序固定为：一级标题（译文标题）、作者行、原文链接行、正文，不得改变。',
  '6. 不遗漏正文，不添加原文不存在的内容。',
].join('\n')

/**
 * 根据提取出的文章组装翻译消息。
 * user 消息仅包含标题、作者、原文链接和 Markdown 正文，不包含页面噪声。
 */
export function buildTranslationMessages(article: ExtractedArticle): ChatMessage[] {
  const userContent = [
    `文章标题：${article.title}`,
    `作者：${article.author || '（无）'}`,
    `原文链接：${article.url}`,
    '',
    '以下为正文 Markdown，请翻译：',
    '',
    article.markdown,
  ].join('\n')

  return [
    { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]
}
