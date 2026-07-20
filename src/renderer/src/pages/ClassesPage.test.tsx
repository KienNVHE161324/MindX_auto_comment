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

  it('bấm "Đồng bộ từ LMS": tính đúng contentTargets, lưu content buổi thiếu, hiện tóm tắt', async () => {
    const clsA1: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }],
      sessions: [{ id: 'ss1', dateTime: '2020-01-01T14:00:00' }, { id: 'ss2', dateTime: '2099-01-01T14:00:00' }],
    }
    const api = stub({
      listClasses: vi.fn(async () => [clsA1]),
      getContent: vi.fn(async () => null),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsSyncAll: vi.fn(async () => ({
        newClasses: [],
        contentResults: [{
          classCode: 'A1', sessionDate: '2020-01-01',
          lessonContent: 'Bài học', homework: 'BT',
          students: [{ name: 'An', attended: true, comment: 'Ngoan' }],
        }],
        skippedClasses: [],
      })),
      saveContent: vi.fn(async () => {}),
    })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))

    fireEvent.click(screen.getByText(/đồng bộ từ lms/i))

    await waitFor(() => expect(api.lmsSyncAll).toHaveBeenCalledWith({
      existingCodes: ['A1'],
      contentTargets: [{ classCode: 'A1', sessionId: 'ss1', sessionDate: '2020-01-01' }],
    }))
    await waitFor(() => expect(api.saveContent).toHaveBeenCalledWith({
      id: 'ss1', classId: 'c1', sessionId: 'ss1',
      lessonContent: 'Bài học', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
      absentStudentIds: [],
    }))
    await waitFor(() => expect(screen.getByText(/đã cập nhật nội dung 1 buổi/i)).toBeInTheDocument())
  })

  it('lớp bị bỏ qua (LMS chưa có nội dung) hiện trong tóm tắt', async () => {
    const clsA1: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }],
      sessions: [{ id: 'ss1', dateTime: '2020-01-01T14:00:00' }, { id: 'ss2', dateTime: '2099-01-01T14:00:00' }],
    }
    stub({
      listClasses: vi.fn(async () => [clsA1]),
      getContent: vi.fn(async () => null),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsSyncAll: vi.fn(async () => ({ newClasses: [], contentResults: [], skippedClasses: ['A1'] })),
      saveContent: vi.fn(async () => {}),
    })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))
    fireEvent.click(screen.getByText(/đồng bộ từ lms/i))
    await waitFor(() => expect(screen.getByText(/bỏ qua 1 lớp/i)).toBeInTheDocument())
  })
})
