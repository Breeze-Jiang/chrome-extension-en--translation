import type { TranslationState } from '../../shared/contracts/translation'
import { getUserFacingError } from '../../shared/errors/user-message'

interface StatusPanelProps {
  state: Exclude<TranslationState, { kind: 'idle' }>
}

const STATUS_TEXT: Record<StatusPanelProps['state']['kind'], string> = {
  extracting: '正在提取文章',
  preview: '文章提取成功，等待翻译',
  translating: '正在翻译',
  completed: '翻译完成',
  failed: '翻译未完成',
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

/** 状态反馈区：展示提取、翻译、完成或错误状态，失败态附带面向用户的错误文案。 */
export function StatusPanel({ state }: StatusPanelProps) {
  const detail = state.kind === 'failed' ? getUserFacingError(state.errorCode).message : null
  return (
    <div className="status-panel" role="status">
      <div className="status-panel__line">
        <span className="status-panel__icon" aria-hidden="true">
          {STATUS_ICON[state.kind]}
        </span>
        <span className="status-panel__text">{STATUS_TEXT[state.kind]}</span>
      </div>
      {detail && <p className="status-panel__detail">{detail}</p>}
    </div>
  )
}