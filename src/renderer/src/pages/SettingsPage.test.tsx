// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import SettingsPage from './SettingsPage'
import { DEFAULT_CONFIG } from '../../../shared/types'

function stubApi(overrides: Partial<Window['api']> = {}) {
  const api = {
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    updateConfig: vi.fn(async (patch) => ({ ...DEFAULT_CONFIG, ...patch })),
    validateGeminiKey: vi.fn(async () => ({ valid: true })),
    pickFolder: vi.fn(async () => '/data/mindx'),
    ...overrides,
  }
  ;(window as unknown as { api: Window['api'] }).api = api as unknown as Window['api']
  return api
}

beforeEach(() => stubApi())

describe('SettingsPage', () => {
  it('tải & hiển thị template Zalo mặc định khi mount', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText(/mẫu tin nhắn zalo/i)).toHaveValue(DEFAULT_CONFIG.zaloMessageTemplate),
    )
  })

  it('bấm "Chọn thư mục" cập nhật đường dẫn hiển thị', async () => {
    const api = stubApi()
    render(<SettingsPage />)
    await waitFor(() => screen.getByText(/chọn thư mục/i))
    fireEvent.click(screen.getByText(/chọn thư mục/i))
    await waitFor(() => expect(screen.getByText('/data/mindx')).toBeInTheDocument())
    expect(api.pickFolder).toHaveBeenCalled()
  })

  it('bấm "Kiểm tra key" hiện trạng thái hợp lệ', async () => {
    const api = stubApi({ validateGeminiKey: vi.fn(async () => ({ valid: true })) })
    render(<SettingsPage />)
    await waitFor(() => screen.getByLabelText(/api key gemini/i))
    fireEvent.change(screen.getByLabelText(/api key gemini/i), { target: { value: 'k1' } })
    fireEvent.click(screen.getByText(/kiểm tra key/i))
    await waitFor(() => expect(screen.getByText(/key hợp lệ/i)).toBeInTheDocument())
    expect(api.validateGeminiKey).toHaveBeenCalledWith('k1')
  })

  it('key sai hiện thông báo lỗi', async () => {
    stubApi({ validateGeminiKey: vi.fn(async () => ({ valid: false, error: 'API key không hợp lệ.' })) })
    render(<SettingsPage />)
    await waitFor(() => screen.getByLabelText(/api key gemini/i))
    fireEvent.change(screen.getByLabelText(/api key gemini/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText(/kiểm tra key/i))
    await waitFor(() => expect(screen.getByText(/không hợp lệ/i)).toBeInTheDocument())
  })

  it('bấm "Lưu" gọi updateConfig với dữ liệu đang nhập', async () => {
    const api = stubApi()
    render(<SettingsPage />)
    await waitFor(() => screen.getByLabelText(/api key gemini/i))
    fireEvent.change(screen.getByLabelText(/api key gemini/i), { target: { value: 'k9' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() =>
      expect(api.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ geminiApiKey: 'k9', storageBackend: 'local' }),
      ),
    )
  })
})
