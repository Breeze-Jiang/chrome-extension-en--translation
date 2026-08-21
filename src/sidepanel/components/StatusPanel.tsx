import type { TranslationState } from '../../shared/contracts/translation'

interface StatusPanelProps {
  state: Exclude<TranslationState, { kind: 'idle' }>
}

const STATUS_TEXT: Record<StatusPanelProps['state']['kind'], string> = {
  extracting: '正在提取文章',
  preview: '文章提取成功，等待翻译',
  translating: '正在翻译',
  completed: '翻译完成',
  failed: '翻译未完成，请重试或检查设置',
  cancelled: '翻译已取消',
}

const STATUS_ICON: Record<StatusPanelProps['state']['kind'], string> = {
  extracting: '●',
  preview: '√',
  translating: '●',
  completed: '√',
  failed: '!',
  cancelled: '!',
}

/** 状态反馈区：展示提取、翻译、完成或错误状态。 */
export function StatusPanel({ state }: StatusPanelProps) {
  return (
    <div className="status-panel" role="status">
      <span className="status-panel__icon" aria-hidden="true">
        {STATUS_ICON[state.kind]}
      </span>
      <span className="status-panel__text">{STATUS_TEXT[state.kind]}</span>
    </div>
  )
}
