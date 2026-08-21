import { MarkdownRenderer } from 'md-wx'
import 'md-wx/dist/style.css'

interface TranslationViewProps {
  markdown: string
}

/** 译文阅读区：使用 md-wx 渲染 Markdown，关闭设置面板、视图切换和非核心能力。 */
export function TranslationView({ markdown }: TranslationViewProps) {
  return (
    <section className="translation-view" aria-label="译文">
      <MarkdownRenderer
        markdown={markdown}
        theme="minimal"
        defaultViewMode="mobile"
        followSystemTheme={false}
        showSettings={false}
        enableCopy={false}
        enableThemeSwitch={false}
        enableViewModeToggle={false}
      />
    </section>
  )
}
