import type { TranslationState } from '../../shared/contracts/translation'

interface ActionBarProps {
  state: TranslationState
  disabled?: boolean
  onTranslate?: () => void
  onCancel?: () => void
  onRetry?: () => void
  onReTranslate?: () => void
  onDownload?: () => void
  onOpenSettings?: () => void
}

/** 主操作区与底部操作区：随状态变化展示一键翻译、取消、重试、重新翻译或下载按钮。 */
export function ActionBar({
  state,
  disabled = false,
  onTranslate,
  onCancel,
  onRetry,
  onReTranslate,
  onDownload,
  onOpenSettings,
}: ActionBarProps) {
  switch (state.kind) {
    case 'idle':
      return (
        <div className="action-bar">
          <button
            type="button"
            className="button button--primary"
            onClick={onTranslate}
            disabled={disabled}
          >
            一键翻译当前网页
          </button>
        </div>
      )
    case 'extracting':
    case 'translating':
      return (
        <div className="action-bar">
          <button type="button" className="button button--secondary" onClick={onCancel}>
            取消翻译
          </button>
        </div>
      )
    case 'preview':
      return null
    case 'completed':
      return (
        <div className="action-bar">
          <button type="button" className="button button--primary" onClick={onDownload}>
            下载 Markdown
          </button>
          <button type="button" className="button button--link" onClick={onReTranslate}>
            重新翻译
          </button>
        </div>
      )
    case 'failed':
      return (
        <div className="action-bar">
          <button type="button" className="button button--primary" onClick={onRetry}>
            重试
          </button>
          <button type="button" className="button button--link" onClick={onOpenSettings}>
            打开设置
          </button>
        </div>
      )
    case 'cancelled':
      return (
        <div className="action-bar">
          <button type="button" className="button button--primary" onClick={onRetry}>
            重试
          </button>
        </div>
      )
  }
}
