// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
  it('bấm "Xóa" mở hộp xác nhận; xác nhận gọi deleteClass rồi tải lại', async () => {
    const api = stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))
    fireEvent.click(screen.getByLabelText(/xóa lớp A1/i))
    // Chưa xóa cho tới khi xác nhận trong hộp thoại
    const dialog = await screen.findByRole('dialog')
    expect(api.deleteClass).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xóa lớp' }))
    await waitFor(() => expect(api.deleteClass).toHaveBeenCalledWith('c1'))
    expect(api.listClasses).toHaveBeenCalledTimes(2)
  })

  it('bấm "Xóa" rồi "Hủy" không gọi deleteClass', async () => {
    const api = stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))
    fireEvent.click(screen.getByLabelText(/xóa lớp A1/i))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /hủy/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deleteClass).not.toHaveBeenCalled()
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

  it('hiện đúng trạng thái buổi: chưa có nội dung / đã soạn nội dung / đã nhận xét', async () => {
    const cls: SchoolClass = {
      id: 'c3', code: 'C3', name: 'Lớp C3', students: [{ id: 's1', name: 'An' }],
      sessions: [
        { id: 'ss1', dateTime: '2026-01-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-01-08T14:00:00' },
        { id: 'ss3', dateTime: '2026-01-15T14:00:00' },
      ],
    }
    stub({
      listClasses: vi.fn(async () => [cls]),
      getContent: vi.fn(async (sessionId: string) => {
        if (sessionId === 'ss2') return { id: 'ss2', classId: 'c3', sessionId: 'ss2', lessonContent: 'x', homework: '', comments: [] }
        if (sessionId === 'ss3') return { id: 'ss3', classId: 'c3', sessionId: 'ss3', lessonContent: 'x', homework: '', comments: [], postedToLms: true }
        return null
      }),
    })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('C3'))
    expect(screen.getAllByText('chưa có nội dung').length).toBeGreaterThan(0)
    expect(screen.getByText('đã soạn nội dung')).toBeInTheDocument()
    expect(screen.getByText('đã nhận xét')).toBeInTheDocument()
  })

  it('hiển thị số buổi đã qua của lớp', async () => {
    const cls: SchoolClass = {
      id: 'c3', code: 'C3', name: 'Lớp C3', students: [{ id: 's1', name: 'An' }],
      sessions: [
        { id: 'ss1', dateTime: '2026-01-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-01-08T14:00:00' },
        { id: 'ss3', dateTime: '2099-01-15T14:00:00' },
      ],
    }
    stub({ listClasses: vi.fn(async () => [cls]), getContent: vi.fn(async () => null) })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('C3'))
    expect(screen.getByText(/đã qua 2\/3 buổi/i)).toBeInTheDocument()
  })

  it('giữ một ô hành động phụ cho mỗi hàng buổi học', async () => {
    const cls: SchoolClass = {
      id: 'c4', code: 'D4', name: 'Lớp D4', students: [{ id: 's1', name: 'An' }],
      sessions: [
        { id: 'ss1', dateTime: '2026-01-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-01-08T14:00:00' },
      ],
    }
    stub({
      listClasses: vi.fn(async () => [cls]),
      getContent: vi.fn(async (sessionId: string) => sessionId === 'ss1'
        ? { id: 'ss1', classId: 'c4', sessionId: 'ss1', lessonContent: 'Bài trước', homework: '', comments: [] }
        : null),
    })
    const { container } = render(<ClassesPage />)

    await waitFor(() => expect(screen.getByText('D4')).toBeInTheDocument())
    const rows = container.querySelectorAll('.session-row')
    expect(rows).toHaveLength(2)
    rows.forEach(row => expect(row.querySelectorAll('.session-secondary-action')).toHaveLength(1))
    expect(rows[0].querySelector('.session-secondary-action button')).toBeNull()
    expect(rows[1].querySelector('.session-secondary-action button')).toHaveTextContent(/sao chép buổi trước/i)
  })

  it('nút "Sao chép buổi trước" chỉ hiện khi buổi chưa có nội dung và buổi trước đã có; bấm sẽ lưu bản sao', async () => {
    const cls: SchoolClass = {
      id: 'c3', code: 'C3', name: 'Lớp C3', students: [{ id: 's1', name: 'An' }],
      sessions: [
        { id: 'ss1', dateTime: '2026-01-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-01-08T14:00:00' },
      ],
    }
    const prevContent = { id: 'ss1', classId: 'c3', sessionId: 'ss1', lessonContent: 'Bài trước', homework: 'BT', comments: [{ studentId: 's1', raw: 'Ngoan', polished: '' }] }
    const api = stub({
      listClasses: vi.fn(async () => [cls]),
      getContent: vi.fn(async (sessionId: string) => (sessionId === 'ss1' ? prevContent : null)),
      saveContent: vi.fn(async () => {}),
    })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('C3'))
    const copyBtn = await screen.findByLabelText(/sao chép buổi trước c3/i)
    fireEvent.click(copyBtn)
    await waitFor(() => expect(api.saveContent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'ss2', classId: 'c3', lessonContent: 'Bài trước', homework: 'BT',
      comments: [{ studentId: 's1', raw: 'Ngoan', polished: '' }],
      absentStudentIds: [], postedToLms: false,
    })))
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
