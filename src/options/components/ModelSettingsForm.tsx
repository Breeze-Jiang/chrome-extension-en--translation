import { useState } from 'react'
import type { FormEvent } from 'react'

import {
  SETTINGS_CONTRACT_VERSION,
  type ModelSettings,
} from '../../shared/contracts/settings'
import { DEFAULT_BASE_URL, isAllowedBaseUrl } from '../../storage/settings-repository'

interface ModelSettingsFormProps {
  initialSettings: ModelSettings | null
  onSave: (settings: ModelSettings) => Promise<void>
}

interface FieldErrors {
  baseUrl?: string
  apiKey?: string
  model?: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** 模型连接表单：编辑 Base URL、API Key 和模型名称，并在保存前执行字段校验。 */
export function ModelSettingsForm({ initialSettings, onSave }: ModelSettingsFormProps) {
  const [baseUrl, setBaseUrl] = useState(initialSettings?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(initialSettings?.apiKey ?? '')
  const [model, setModel] = useState(initialSettings?.model ?? '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<SaveStatus>('idle')

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (baseUrl.trim().length === 0) {
      errors.baseUrl = '请输入服务地址'
    } else if (!isAllowedBaseUrl(baseUrl.trim())) {
      errors.baseUrl = '仅支持受信任的 HTTPS Qwen 服务地址'
    }
    if (apiKey.trim().length === 0) {
      errors.apiKey = '请输入 API Key'
    }
    if (model.trim().length === 0) {
      errors.model = '请输入模型名称'
    }
    return errors
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setStatus('idle')
      return
    }

    setStatus('saving')
    try {
      await onSave({
        version: SETTINGS_CONTRACT_VERSION,
        baseUrl: baseUrl.trim(),
        apiKey,
        model: model.trim(),
      })
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="baseUrl">OpenAI 兼容服务地址</label>
        <input
          id="baseUrl"
          type="text"
          value={baseUrl}
          placeholder={DEFAULT_BASE_URL}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
        {fieldErrors.baseUrl && <p className="field__error">{fieldErrors.baseUrl}</p>}
      </div>

      <div className="field">
        <label htmlFor="apiKey">API Key</label>
        <input
          id="apiKey"
          type={showApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        {fieldErrors.apiKey && <p className="field__error">{fieldErrors.apiKey}</p>}
      </div>

      <div className="field field--inline">
        <input
          id="showApiKey"
          type="checkbox"
          checked={showApiKey}
          onChange={(event) => setShowApiKey(event.target.checked)}
        />
        <label htmlFor="showApiKey">显示 API Key</label>
      </div>

      <div className="field">
        <label htmlFor="model">模型名称</label>
        <input
          id="model"
          type="text"
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
        {fieldErrors.model && <p className="field__error">{fieldErrors.model}</p>}
      </div>

      <p className="settings-form__hint">
        密钥仅保存在本地扩展存储中，并仅用于向上述模型服务发起翻译请求。
      </p>

      <button type="submit" className="button button--primary" disabled={status === 'saving'}>
        {status === 'saving' ? '保存中…' : '保存设置'}
      </button>

      {status === 'saved' && (
        <p className="settings-form__feedback" role="status">
          设置已保存
        </p>
      )}
      {status === 'error' && (
        <p className="settings-form__feedback settings-form__feedback--error">保存失败，请重试。</p>
      )}
    </form>
  )
}
