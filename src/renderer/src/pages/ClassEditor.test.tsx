// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ClassEditor from './ClassEditor'
import { SchoolClass } from '../../../shared/types'

function stub() {
  const api = {
    getConfig: vi.fn(), updateConfig: vi.fn(), validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
    listClasses: vi.fn(), getClass: vi.fn(), saveClass: vi.fn(async () => {}), deleteClass: vi.fn(),
  }
  ;(window as unknown as { api: Window['api'] }).api = api as unknown as Window['api']
  return api
}
beforeEach(() => stub())

const base: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [{ id: 's1', name: 'An' }], sessions: [] }

describe('ClassEditor', () => {
  it('hiển thị mã/tên/học sinh hiện có', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    expect(screen.getByLabelText(/mã lớp/i)).toHaveValue('A1')
    expect(screen.getByLabelText(/tên lớp/i)).toHaveValue('Lớp A1')
    expect(screen.getByDisplayValue('An')).toBeInTheDocument()
  })
  it('thêm học sinh tạo ô nhập mới', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm học sinh/i))
    expect(screen.getAllByPlaceholderText(/tên học sinh/i).length).toBe(2)
  })
  it('sửa mã rồi Lưu gọi saveClass với mã mới', async () => {
    const api = stub()
    const onDone = vi.fn()
    render(<ClassEditor cls={base} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText(/mã lớp/i), { target: { value: 'B2' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', code: 'B2' })))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
  it('thêm buổi học tạo ô ngày + chọn giờ mới', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm buổi/i))
    expect(screen.getAllByLabelText(/ngày buổi/i).length).toBe(1)
    expect(screen.getAllByLabelText(/giờ buổi/i).length).toBe(1)
  })

  it('chọn ngày + giờ lưu dateTime dạng chỉ có giờ (phút = 00)', async () => {
    const api = stub()
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm buổi/i))
    fireEvent.change(screen.getByLabelText(/ngày buổi/i), { target: { value: '2026-07-20' } })
    fireEvent.change(screen.getByLabelText(/giờ buổi/i), { target: { value: '18' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() =>
      expect(api.saveClass).toHaveBeenCalledWith(
        expect.objectContaining({ sessions: [{ id: expect.any(String), dateTime: '2026-07-20T18:00:00' }] }),
      ),
    )
  })
  it('thay ngày giữ nguyên giờ đã chọn', async () => {
    const api = stub()
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm buổi/i))
    fireEvent.change(screen.getByLabelText(/ngày buổi/i), { target: { value: '2026-07-20' } })
    fireEvent.change(screen.getByLabelText(/giờ buổi/i), { target: { value: '14' } })
    fireEvent.change(screen.getByLabelText(/ngày buổi/i), { target: { value: '2026-07-21' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() =>
      expect(api.saveClass).toHaveBeenCalledWith(
        expect.objectContaining({ sessions: [{ id: expect.any(String), dateTime: '2026-07-21T14:00:00' }] }),
      ),
    )
  })

  it('bật gửi tự động + chọn giờ rồi Lưu gọi saveClass với autoSend đúng', async () => {
    const api = stub()
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByLabelText(/tự động gửi lms\/zalo/i))
    fireEvent.change(screen.getByLabelText(/giờ gửi tự động/i), { target: { value: '19:30' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith(
      expect.objectContaining({ autoSend: { enabled: true, time: '19:30' } }),
    ))
  })

  it('"Quay lại" gọi onDone', () => {
    const onDone = vi.fn()
    render(<ClassEditor cls={base} onDone={onDone} />)
    fireEvent.click(screen.getByText(/quay lại/i))
    expect(onDone).toHaveBeenCalled()
  })
  it('Lưu thất bại hiển thị lỗi và KHÔNG gọi onDone', async () => {
    const api = stub()
    api.saveClass = vi.fn(async () => { throw new Error('Chưa chọn thư mục') })
    ;(window as unknown as { api: Window['api'] }).api = api as unknown as Window['api']
    const onDone = vi.fn()
    render(<ClassEditor cls={base} onDone={onDone} />)
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(screen.getByText(/lưu thất bại/i)).toBeInTheDocument())
    expect(onDone).not.toHaveBeenCalled()
  })
})
