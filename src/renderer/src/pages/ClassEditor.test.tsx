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
  it('thêm buổi học tạo ô datetime mới', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm buổi/i))
    expect(screen.getAllByLabelText(/thời điểm buổi/i).length).toBe(1)
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
