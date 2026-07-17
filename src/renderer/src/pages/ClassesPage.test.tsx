// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ClassesPage from './ClassesPage'
import { SchoolClass } from '../../../shared/types'

function stub(overrides: Partial<Window['api']> = {}) {
  const api = {
    getConfig: vi.fn(), updateConfig: vi.fn(), validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
    listClasses: vi.fn(async () => [] as SchoolClass[]),
    getClass: vi.fn(), saveClass: vi.fn(async () => {}), deleteClass: vi.fn(async () => {}),
    ...overrides,
  }
  ;(window as unknown as { api: Window['api'] }).api = api as unknown as Window['api']
  return api
}
beforeEach(() => stub())

const c1: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [{ id: 's1', name: 'An' }], sessions: [] }
const cWithSession: SchoolClass = {
  id: 'c2', code: 'B2', name: 'Lớp B2', students: [{ id: 's2', name: 'Bình' }],
  sessions: [{ id: 'ss1', dateTime: '2026-07-20T18:00:00' }],
}

describe('ClassesPage', () => {
  it('hiển thị "chưa có lớp" khi danh sách rỗng', async () => {
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText(/chưa có lớp/i)).toBeInTheDocument())
  })
  it('liệt kê lớp đã có (mã + tên + số HS)', async () => {
    stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.getByText(/Lớp A1/)).toBeInTheDocument()
    expect(screen.getByText(/1 học sinh/i)).toBeInTheDocument()
  })
  it('bấm "+ Thêm lớp" mở trình soạn (hiện ô Mã lớp)', async () => {
    render(<ClassesPage />)
    await waitFor(() => screen.getByText(/^\+ Thêm lớp$/i))
    fireEvent.click(screen.getByText(/^\+ Thêm lớp$/i))
    await waitFor(() => expect(screen.getByLabelText(/mã lớp/i)).toBeInTheDocument())
  })
  it('bấm "Xóa" gọi deleteClass rồi tải lại', async () => {
    const api = stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))
    fireEvent.click(screen.getByLabelText(/xóa lớp A1/i))
    await waitFor(() => expect(api.deleteClass).toHaveBeenCalledWith('c1'))
    expect(api.listClasses).toHaveBeenCalledTimes(2)
  })
  it('lớp có buổi hiện nút "Soạn nội dung", bấm mở trình soạn', async () => {
    stub({ listClasses: vi.fn(async () => [cWithSession]), getContent: vi.fn(async () => null), getConfig: vi.fn(async () => (await import('../../../shared/types')).DEFAULT_CONFIG) })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('B2'))
    fireEvent.click(screen.getByLabelText(/soạn nội dung B2/i))
    await waitFor(() => expect(screen.getByLabelText(/nội dung bài học/i)).toBeInTheDocument())
  })

  it('báo lỗi khi listClasses thất bại (chưa cấu hình thư mục)', async () => {
    stub({ listClasses: vi.fn(async () => { throw new Error('Chưa chọn thư mục') }) })
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText(/chưa chọn thư mục/i)).toBeInTheDocument())
  })
})
