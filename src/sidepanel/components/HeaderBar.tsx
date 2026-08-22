interface HeaderBarProps {
  onOpenSettings?: () => void
}

/** 顶部栏：展示产品名称，并提供进入设置页的入口。 */
export function HeaderBar({ onOpenSettings }: HeaderBarProps) {
  function handleOpenSettings() {
    if (onOpenSettings) {
      onOpenSettings()
      return
    }
    void chrome.runtime.openOptionsPage()
  }

  return (
    <header className="header-bar">
      <span className="header-bar__title">英文网页翻译</span>
      <button type="button" className="header-bar__settings" onClick={handleOpenSettings}>
        模型切换设置
      </button>
    </header>
  )
}
