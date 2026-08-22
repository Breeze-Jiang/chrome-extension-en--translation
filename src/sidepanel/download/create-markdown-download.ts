const FALLBACK_FILENAME = 'translated-article.md'
const MAX_TITLE_LENGTH = 100
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g
const TRAILING_DOTS_OR_SPACES = /[. ]+$/g
const WINDOWS_RESERVED_FILENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

export function createMarkdownFilename(title: string): string {
  const sanitizedTitle = Array.from(title)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .replace(INVALID_FILENAME_CHARACTERS, '')
    .replace(TRAILING_DOTS_OR_SPACES, '')
    .slice(0, MAX_TITLE_LENGTH)
    .replace(TRAILING_DOTS_OR_SPACES, '')

  if (!sanitizedTitle || WINDOWS_RESERVED_FILENAME.test(sanitizedTitle)) {
    return FALLBACK_FILENAME
  }

  return `${sanitizedTitle}.md`
}

export function createMarkdownDownload(title: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = createMarkdownFilename(title)
  link.click()
  URL.revokeObjectURL(objectUrl)
}
