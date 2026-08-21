import { useEffect, useState } from 'react'

import type { ModelSettings } from '../shared/contracts/settings'
import { readSettings, saveSettings } from '../storage/settings-repository'

import { ModelSettingsForm } from './components/ModelSettingsForm'

/** 设置页：读取本地模型配置并提供编辑与保存。 */
export function App() {
  const [initialSettings, setInitialSettings] = useState<ModelSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    readSettings()
      .then((settings) => {
        if (!cancelled) {
          setInitialSettings(settings)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '读取配置失败。')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleSave(settings: ModelSettings): Promise<void> {
    return saveSettings(settings)
  }

  return (
    <div className="options-page">
      <header className="options-page__header">
        <button type="button" className="button button--link" onClick={() => window.close()}>
          返回
        </button>
        <h1 className="options-page__title">模型设置</h1>
      </header>

      {!loaded ? null : loadError ? (
        <p className="options-page__error">{loadError}</p>
      ) : (
        <ModelSettingsForm initialSettings={initialSettings} onSave={handleSave} />
      )}
    </div>
  )
}
