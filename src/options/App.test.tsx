import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readSettings, saveSettings } from '../storage/settings-repository'
import { App } from './App'

vi.mock('../storage/settings-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage/settings-repository')>()
  return {
    ...actual,
    readSettings: vi.fn(),
    saveSettings: vi.fn(),
  }
})

const mockedReadSettings = vi.mocked(readSettings)
const mockedSaveSettings = vi.mocked(saveSettings)

beforeEach(() => {
  mockedReadSettings.mockReset()
  mockedSaveSettings.mockReset()
  mockedReadSettings.mockResolvedValue(null)
  mockedSaveSettings.mockResolvedValue(undefined)
})

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('OpenAI 兼容服务地址'), {
    target: { value: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  })
  fireEvent.change(screen.getByLabelText('API Key'), {
    target: { value: 'sk-test-123456' },
  })
  fireEvent.change(screen.getByLabelText('模型名称'), {
    target: { value: 'qwen-plus' },
  })
}

describe('设置页面渲染', () => {
  it('渲染三个配置字段和保存按钮', async () => {
    render(<App />)

    expect(await screen.findByLabelText('OpenAI 兼容服务地址')).toBeInTheDocument()
    expect(screen.getByLabelText('API Key')).toBeInTheDocument()
    expect(screen.getByLabelText('模型名称')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存设置' })).toBeInTheDocument()
  })

  it('API Key 默认隐藏，勾选后显示', async () => {
    render(<App />)

    const apiKeyInput = await screen.findByLabelText('API Key')
    expect(apiKeyInput).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByLabelText('显示 API Key'))
    expect(apiKeyInput).toHaveAttribute('type', 'text')
  })
})

describe('设置页面校验', () => {
  it('空字段提交时显示错误且不保存', async () => {
    render(<App />)
    await screen.findByLabelText('OpenAI 兼容服务地址')

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('请输入服务地址')).toBeInTheDocument()
    expect(screen.getByText('请输入 API Key')).toBeInTheDocument()
    expect(screen.getByText('请输入模型名称')).toBeInTheDocument()
    expect(mockedSaveSettings).not.toHaveBeenCalled()
  })

  it('HTTP 地址无法保存', async () => {
    render(<App />)
    await screen.findByLabelText('OpenAI 兼容服务地址')

    fireEvent.change(screen.getByLabelText('OpenAI 兼容服务地址'), {
      target: { value: 'http://dashscope.aliyuncs.com/compatible-mode/v1' },
    })
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test-123456' } })
    fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'qwen-plus' } })

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('仅支持受信任的 HTTPS Qwen 服务地址')).toBeInTheDocument()
    expect(mockedSaveSettings).not.toHaveBeenCalled()
  })

  it('不受信任的域名无法保存', async () => {
    render(<App />)
    await screen.findByLabelText('OpenAI 兼容服务地址')

    fireEvent.change(screen.getByLabelText('OpenAI 兼容服务地址'), {
      target: { value: 'https://evil.example.com/v1' },
    })
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test-123456' } })
    fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'qwen-plus' } })

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('仅支持受信任的 HTTPS Qwen 服务地址')).toBeInTheDocument()
    expect(mockedSaveSettings).not.toHaveBeenCalled()
  })
})

describe('设置页面保存', () => {
  it('合法提交时保存并显示成功反馈', async () => {
    render(<App />)
    await screen.findByLabelText('OpenAI 兼容服务地址')

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(mockedSaveSettings).toHaveBeenCalledWith({
        version: 1,
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test-123456',
        model: 'qwen-plus',
      })
    })
    expect(await screen.findByText('设置已保存')).toBeInTheDocument()
  })

  it('保存失败时显示错误反馈', async () => {
    mockedSaveSettings.mockRejectedValue(new Error('write failed'))
    render(<App />)
    await screen.findByLabelText('OpenAI 兼容服务地址')

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(await screen.findByText('保存失败，请重试。')).toBeInTheDocument()
  })
})

describe('设置页面读取', () => {
  it('挂载时恢复已保存配置', async () => {
    mockedReadSettings.mockResolvedValue({
      version: 1,
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-existing',
      model: 'qwen-turbo',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByLabelText('OpenAI 兼容服务地址')).toHaveValue(
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      )
    })
    expect(screen.getByLabelText('模型名称')).toHaveValue('qwen-turbo')
  })
})
