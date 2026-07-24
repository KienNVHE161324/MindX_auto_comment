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
    getAutoSendCatchUp: vi.fn(async () => []),
    runAutoSendCatchUp: vi.fn(async () => []),
    ...overrides,
  }
  ;(window as unknown as { api: Window['api'] }).api = api as unknown as Window['api']
  return api
}
beforeEach(() => stub())

const c1: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [{ id: 's1', name: 'An' }], sessions: [] }
const cWithSession: SchoolClass = {
  id: 'c2', code: 'B2', name: 'Lớp B2', students: [{ id: 's2', name: 'Bình' }],
  sessions: [
    { id: 'ss0', dateTime: '2020-07-20T18:00:00' },
    { id: 'ss1', dateTime: '2099-07-20T18:00:00' },
  ],
}
const catchUpItem = {
  classId: 'c1',
  classCode: 'A1',
  className: 'Lớp A1',
  sessionId: 'ss1',
  sessionDateTime: '2026-07-20T18:00:00',
  channels: ['lms' as const, 'zalo' as const],
}
const filterClassesFixture: SchoolClass[] = [
  {
    id: 'running-r',
    code: 'ABC-R01',
    name: 'Robotics',
    students: [],
    sessions: [
      { id: 'r-past', dateTime: '2020-01-01T09:00:00' },
      { id: 'r-future', dateTime: '2099-01-01T09:00:00' },
    ],
  },
  {
    id: 'future-g',
    code: 'ABC-G01',
    name: 'Game',
    students: [],
    sessions: [{ id: 'g-future', dateTime: '2099-01-01T09:00:00' }],
  },
  {
    id: 'ended-j',
    code: 'ABC-J01',
    name: 'Web',
    students: [],
    sessions: [{ id: 'j-past', dateTime: '2020-01-01T09:00:00' }],
  },
]

async function enableNotStartedClasses() {
  fireEvent.change(await screen.findByLabelText('Lọc theo trạng thái'), { target: { value: 'all' } })
}

async function enableEndedClasses() {
  fireEvent.change(await screen.findByLabelText('Lọc theo trạng thái'), { target: { value: 'all' } })
}

describe('ClassesPage', () => {
  it('mặc định chỉ hiện lớp đang diễn ra và số X/Y', async () => {
    stub({
      listClasses: vi.fn(async () => filterClassesFixture),
      getContent: vi.fn(async () => null),
    })
    render(<ClassesPage />)

    expect(await screen.findByText('ABC-R01')).toBeInTheDocument()
    expect(screen.queryByText('ABC-G01')).not.toBeInTheDocument()
    expect(screen.queryByText('ABC-J01')).not.toBeInTheDocument()
    expect(screen.getByText('Đang xem 1/3 lớp')).toBeInTheDocument()
  })

  it('bật lớp chưa bắt đầu rồi thu hẹp còn Game', async () => {
    stub({
      listClasses: vi.fn(async () => filterClassesFixture),
      getContent: vi.fn(async () => null),
    })
    render(<ClassesPage />)
    await screen.findByText('ABC-R01')

    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), {
      target: { value: 'chưa bắt đầu' },
    })

    expect(screen.getByText('ABC-G01')).toBeInTheDocument()
    expect(screen.queryByText('ABC-R01')).not.toBeInTheDocument()
    expect(screen.getByText('Đang xem 1/3 lớp')).toBeInTheDocument()
  })

  it('phân biệt không có kết quả lọc với repository chưa có lớp', async () => {
    stub({
      listClasses: vi.fn(async () => filterClassesFixture),
      getContent: vi.fn(async () => null),
    })
    render(<ClassesPage />)
    await screen.findByText('ABC-R01')

    fireEvent.click(screen.getByLabelText('Lọc loại Robotics'))
    fireEvent.click(screen.getByLabelText('Lọc loại Game'))
    fireEvent.click(screen.getByLabelText('Lọc loại Web'))
    fireEvent.click(screen.getByLabelText('Lọc loại Scratch'))

    expect(screen.getByText('Không có lớp phù hợp với bộ lọc.')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có lớp nào.')).not.toBeInTheDocument()
  })

  it('hiện lịch bị bỏ lỡ khi mở app nhưng chưa tự gửi', async () => {
    const api = stub({
      getAutoSendCatchUp: vi.fn(async () => [catchUpItem]),
    })
    render(<ClassesPage />)

    expect(await screen.findByText(/có lịch gửi bị bỏ lỡ/i)).toBeInTheDocument()
    expect(screen.getByText(/A1 — Lớp A1/i)).toBeInTheDocument()
    expect(screen.getByText(/LMS, Zalo/i)).toBeInTheDocument()
    expect(api.runAutoSendCatchUp).not.toHaveBeenCalled()
  })

  it('Để sau đóng thông báo và không gửi', async () => {
    const api = stub({
      getAutoSendCatchUp: vi.fn(async () => [catchUpItem]),
    })
    render(<ClassesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Để sau' }))

    expect(screen.queryByText(/có lịch gửi bị bỏ lỡ/i)).not.toBeInTheDocument()
    expect(api.runAutoSendCatchUp).not.toHaveBeenCalled()
  })

  it('Gửi bù tất cả hiện kết quả riêng từng lớp', async () => {
    const api = stub({
      getAutoSendCatchUp: vi.fn(async () => [catchUpItem]),
      runAutoSendCatchUp: vi.fn(async () => [
        {
          classId: 'c1',
          classCode: 'A1',
          sessionId: 'ss1',
          status: 'success' as const,
          completedChannels: ['lms' as const, 'zalo' as const],
          message: 'Đã gửi các kênh đã chọn.',
        },
        {
          classId: 'c2',
          classCode: 'B2',
          sessionId: 'ss2',
          status: 'error' as const,
          completedChannels: [],
          message: 'Mất kết nối LMS.',
        },
      ]),
    })
    render(<ClassesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Gửi bù tất cả' }))

    await waitFor(() => expect(api.runAutoSendCatchUp).toHaveBeenCalledOnce())
    expect(await screen.findByText(/A1: thành công/i)).toBeInTheDocument()
    expect(screen.getByText(/B2: lỗi/i)).toBeInTheDocument()
  })

  it('hiển thị "chưa có lớp" khi danh sách rỗng', async () => {
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText(/chưa có lớp/i)).toBeInTheDocument())
  })
  it('liệt kê lớp đã có (mã + tên + số HS)', async () => {
    stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await enableNotStartedClasses()
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.getByText(/Lớp A1/)).toBeInTheDocument()
    expect(screen.getByText(/1 học sinh/i)).toBeInTheDocument()
  })

  it('bật LMS trên thẻ lớp và tự lưu độc lập với Zalo', async () => {
    const configured: SchoolClass = {
      ...c1,
      sessions: [
        { id: 'past', dateTime: '2020-01-01T18:00:00' },
        { id: 'future', dateTime: '2099-01-01T18:00:00' },
      ],
      autoSend: { time: '18:00', lmsEnabled: false, zaloEnabled: false },
    }
    const api = stub({ listClasses: vi.fn(async () => [configured]) })
    render(<ClassesPage />)
    await enableNotStartedClasses()

    fireEvent.click(await screen.findByLabelText('Tự động LMS A1'))

    await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith({
      ...configured,
      autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false, dayOffset: 'same' },
    }))
    expect(screen.getByLabelText('Tự động LMS A1')).toBeChecked()
    expect(screen.getByLabelText('Tự động Zalo A1')).not.toBeChecked()
  })

  it('đổi giờ trên thẻ lớp và tự lưu', async () => {
    const configured: SchoolClass = {
      ...c1,
      sessions: [
        { id: 'past', dateTime: '2020-01-01T18:00:00' },
        { id: 'future', dateTime: '2099-01-01T18:00:00' },
      ],
      autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false },
    }
    const api = stub({ listClasses: vi.fn(async () => [configured]) })
    render(<ClassesPage />)
    await enableNotStartedClasses()

    fireEvent.change(await screen.findByLabelText('Giờ tự động A1'), {
      target: { value: '19:30' },
    })

    await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith({
      ...configured,
      autoSend: { time: '19:30', lmsEnabled: true, zaloEnabled: false, dayOffset: 'same' },
    }))
  })

  it('đổi ngày gửi tự động (cùng ngày / hôm sau) và tự lưu', async () => {
    const configured: SchoolClass = {
      ...c1,
      sessions: [
        { id: 'past', dateTime: '2020-01-01T18:00:00' },
        { id: 'future', dateTime: '2099-01-01T18:00:00' },
      ],
      autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false },
    }
    const api = stub({ listClasses: vi.fn(async () => [configured]) })
    render(<ClassesPage />)
    await enableNotStartedClasses()

    fireEvent.change(await screen.findByLabelText('Ngày gửi tự động A1'), {
      target: { value: 'next' },
    })

    await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith({
      ...configured,
      autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false, dayOffset: 'next' },
    }))
  })

  it('lưu lịch lỗi thì khôi phục giá trị cũ và hiện lỗi', async () => {
    const configured: SchoolClass = {
      ...c1,
      sessions: [
        { id: 'past', dateTime: '2020-01-01T18:00:00' },
        { id: 'future', dateTime: '2099-01-01T18:00:00' },
      ],
      autoSend: { time: '18:00', lmsEnabled: false, zaloEnabled: false },
    }
    stub({
      listClasses: vi.fn(async () => [configured]),
      saveClass: vi.fn(async () => { throw new Error('Ổ đĩa không ghi được') }),
    })
    render(<ClassesPage />)

    fireEvent.click(await screen.findByLabelText('Tự động LMS A1'))

    await waitFor(() => expect(screen.getByText(/ổ đĩa không ghi được/i)).toBeInTheDocument())
    expect(screen.getByLabelText('Tự động LMS A1')).not.toBeChecked()
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
    await enableNotStartedClasses()
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
    await enableNotStartedClasses()
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
    fireEvent.click(screen.getAllByLabelText(/soạn nội dung B2/i)[0])
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
      attendedStudentIds: ['s1'],
    }))
    await waitFor(() => expect(screen.getByText(/đã cập nhật nội dung buổi mới nhất cho 1 lớp/i)).toBeInTheDocument())
    expect(screen.getByText(/đã cập nhật nội dung buổi mới nhất cho 1 lớp/i).textContent).toContain('A1')
  })

  it('hiện đúng trạng thái buổi: chưa có nội dung / đã soạn nội dung / đã nhận xét', async () => {
    const cls: SchoolClass = {
      id: 'c3', code: 'C3', name: 'Lớp C3', students: [{ id: 's1', name: 'An' }],
      sessions: [
        { id: 'ss1', dateTime: '2026-01-01T14:00:00' },
        { id: 'ss2', dateTime: '2026-01-08T14:00:00' },
        { id: 'ss3', dateTime: '2099-01-15T14:00:00' },
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
        { id: 'ss2', dateTime: '2099-01-08T14:00:00' },
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
        { id: 'ss2', dateTime: '2099-01-08T14:00:00' },
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
