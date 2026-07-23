// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import SessionComposer from './SessionComposer'
import { SchoolClass, ClassSession, DEFAULT_CONFIG } from '../../../shared/types'

function stub(overrides: Partial<Window['api']> = {}) {
  const api = {
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    updateConfig: vi.fn(), validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
    listClasses: vi.fn(), getClass: vi.fn(), saveClass: vi.fn(), deleteClass: vi.fn(),
    getContent: vi.fn(async () => null),
    saveContent: vi.fn(async () => {}),
    extractLessonFromPdf: vi.fn(async () => 'Bài học từ PDF'),
    rewriteComment: vi.fn(async () => 'Em An ngoan, tích cực.'),
    rewriteCommentsBatch: vi.fn(async (items: { name: string; raw: string }[]) => items.map(() => 'Em An ngoan, tích cực.')),
    ...overrides,
  }
  ;(window as unknown as { api: Window['api'] }).api = api as unknown as Window['api']
  return api
}
beforeEach(() => stub())

const cls: SchoolClass = {
  id: 'c1', code: 'A1', name: 'Lớp A1',
  students: [{ id: 's1', name: 'An' }],
  sessions: [],
}
const session: ClassSession = { id: 'ss1', dateTime: '2026-07-20T18:00:00' }

describe('SessionComposer', () => {
  it('hiển thị học sinh trong lớp', async () => {
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByText('An')).toBeInTheDocument())
    expect(screen.getByLabelText(/^nhận xét An$/i)).toBeInTheDocument()
  })

  it('tải nội dung đã lưu nếu có', async () => {
    stub({ getContent: vi.fn(async () => ({
      id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'Đã lưu', homework: 'BT', comments: [],
    })) })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/nội dung bài học/i)).toHaveValue('Đã lưu'))
  })

  it('chặn LMS và chỉnh sửa cho tới khi content đã lưu tải xong', async () => {
    const clsWithTwo: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
      sessions: [],
    }
    let resolveContent!: (content: {
      id: string
      classId: string
      sessionId: string
      lessonContent: string
      homework: string
      comments: { studentId: string; raw: string; polished: string }[]
      absentStudentIds: string[]
    }) => void
    const storedContent = new Promise<{
      id: string
      classId: string
      sessionId: string
      lessonContent: string
      homework: string
      comments: { studentId: string; raw: string; polished: string }[]
      absentStudentIds: string[]
    }>(resolve => { resolveContent = resolve })
    const api = stub({
      getContent: vi.fn(() => storedContent),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({
        posted: ['An'], skipped: ['Bình'], absentStudentNames: ['Bình'],
      })),
    })
    render(<SessionComposer cls={clsWithTwo} session={session} onDone={() => {}} />)

    const lmsButton = screen.getByRole('button', { name: /gửi lên lms/i })
    const previewButton = screen.getByRole('button', { name: /xem trước zalo/i })
    expect(lmsButton).toBeDisabled()
    expect(previewButton).toBeDisabled()
    expect(screen.getByLabelText(/nội dung bài học/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^lưu$/i })).toBeDisabled()
    fireEvent.click(previewButton)
    expect(screen.queryByLabelText(/xem trước zalo/i)).not.toBeInTheDocument()
    fireEvent.click(lmsButton)
    expect(api.lmsPostSession).not.toHaveBeenCalled()

    resolveContent({
      id: 'ss1',
      classId: 'c1',
      sessionId: 'ss1',
      lessonContent: 'Bài đã lưu',
      homework: 'BT đã lưu',
      comments: [
        { studentId: 's1', raw: 'Ngoan', polished: '' },
        { studentId: 's2', raw: 'Chăm', polished: '' },
      ],
      absentStudentIds: ['s2'],
    })
    await waitFor(() => expect(lmsButton).toBeEnabled())
    expect(previewButton).toBeEnabled()
    expect(screen.getByLabelText(/nội dung bài học/i)).toHaveValue('Bài đã lưu')

    fireEvent.click(previewButton)
    const preview = await screen.findByLabelText(/xem trước zalo/i)
    expect(preview.textContent).toContain('Bài đã lưu')
    expect(preview.textContent).toContain('Bình: nghỉ')

    fireEvent.click(lmsButton)
    await waitFor(() => expect(api.lmsPostSession).toHaveBeenCalledWith({
      classCode: 'A1',
      sessionDate: '2026-07-20',
      lessonContent: 'Bài đã lưu',
      homework: 'BT đã lưu',
      comments: [{ studentName: 'An', text: 'Ngoan' }],
    }))
  })

  it('"Nạp PDF & trích" điền nội dung bài học', async () => {
    const api = stub()
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByText(/nạp pdf/i))
    fireEvent.click(screen.getByText(/nạp pdf/i))
    await waitFor(() => expect(screen.getByLabelText(/nội dung bài học/i)).toHaveValue('Bài học từ PDF'))
    expect(api.extractLessonFromPdf).toHaveBeenCalled()
  })

  it('"Sửa tất cả bằng AI" điền kết quả cho mọi HS, "Hoàn tác tất cả" phục hồi bản thô', async () => {
    const api = stub()
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^nhận xét An$/i))
    fireEvent.change(screen.getByLabelText(/^nhận xét An$/i), { target: { value: 'ngoan' } })
    fireEvent.click(screen.getByText(/sửa tất cả bằng AI/i))
    await waitFor(() => expect(screen.getByLabelText(/^nhận xét An$/i)).toHaveValue('Em An ngoan, tích cực.'))
    expect(api.rewriteCommentsBatch).toHaveBeenCalledWith([{ name: 'An', raw: 'ngoan' }])
    fireEvent.click(screen.getByText(/hoàn tác tất cả/i))
    expect(screen.getByLabelText(/^nhận xét An$/i)).toHaveValue('ngoan')
  })

  it('"Xem trước" dựng tin Zalo có tên lớp, bài học, nhận xét, bài tập', async () => {
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^nhận xét An$/i))
    fireEvent.change(screen.getByLabelText(/nội dung bài học/i), { target: { value: 'Phép cộng' } })
    fireEvent.change(screen.getByLabelText(/^nhận xét An$/i), { target: { value: 'ngoan' } })
    fireEvent.change(screen.getByLabelText(/bài tập về nhà/i), { target: { value: 'Làm bài 5' } })
    fireEvent.click(screen.getByText(/xem trước/i))
    const pre = await screen.findByLabelText(/xem trước zalo/i)
    expect(pre.textContent).toContain('lớp Lớp A1 ngày 20/07/2026 18:00')
    expect(pre.textContent).toContain('Phép cộng')
    expect(pre.textContent).toContain('An: ngoan')
    expect(pre.textContent).toContain('Làm bài 5')
  })

  it('"Copy tin nhắn" ghi tin xem trước vào clipboard', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/nội dung bài học/i))
    fireEvent.change(screen.getByLabelText(/nội dung bài học/i), { target: { value: 'Phép cộng' } })
    fireEvent.click(screen.getByText(/xem trước/i))
    await screen.findByLabelText(/xem trước zalo/i)
    fireEvent.click(screen.getByText(/copy tin nhắn/i))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Phép cộng'))
  })

  it('"Lưu" gọi saveContent', async () => {
    const api = stub()
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByText(/^lưu$/i))
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(api.saveContent).toHaveBeenCalled())
    expect(screen.getByText(/đã lưu/i)).toBeInTheDocument()
  })

  it('chặn LMS trong khi thao tác Lưu đang pending', async () => {
    let resolveSave!: () => void
    const saveResult = new Promise<void>(resolve => { resolveSave = resolve })
    const api = stub({
      saveContent: vi.fn(() => saveResult),
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({
        posted: ['An'], skipped: [], absentStudentNames: [],
      })),
    })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    const saveButton = await screen.findByRole('button', { name: /^lưu$/i })
    const lmsButton = screen.getByRole('button', { name: /gửi lên lms/i })
    await waitFor(() => expect(saveButton).toBeEnabled())

    fireEvent.click(saveButton)
    await waitFor(() => expect(api.saveContent).toHaveBeenCalledTimes(1))
    expect(lmsButton).toBeDisabled()
    fireEvent.click(lmsButton)
    expect(api.lmsPostSession).not.toHaveBeenCalled()

    resolveSave()
    await waitFor(() => expect(lmsButton).toBeEnabled())
    fireEvent.click(lmsButton)
    await waitFor(() => expect(api.lmsPostSession).toHaveBeenCalledTimes(1))
  })

  it('đồng bộ nhận xét theo roster: loại HS đã xóa, thêm HS mới khi tải content cũ', async () => {
    const api = stub({
      getContent: vi.fn(async () => ({
        id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: '', homework: '',
        comments: [{ studentId: 's_old', raw: 'cũ', polished: 'cũ' }], // HS không còn trong lớp
      })),
    })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^nhận xét An$/i))
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(api.saveContent).toHaveBeenCalled())
    const saveMock = api.saveContent as unknown as ReturnType<typeof vi.fn>
    const saved = saveMock.mock.calls[0][0] as { comments: { studentId: string }[] }
    expect(saved.comments.map(c => c.studentId)).toEqual(['s1'])
  })

  it('badge "Đã lưu" biến mất khi sửa tiếp sau khi lưu', async () => {
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/nội dung bài học/i))
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(screen.getByText(/đã lưu/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/nội dung bài học/i), { target: { value: 'sửa thêm' } })
    expect(screen.queryByText(/đã lưu/i)).not.toBeInTheDocument()
  })

  it('hiển thị học sinh nghỉ (absentStudentIds) trong tin Zalo xem trước', async () => {
    const clsWithTwo: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
      sessions: [],
    }
    stub({
      getContent: vi.fn(async () => ({
        id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'Bài học', homework: 'BT',
        comments: [{ studentId: 's1', raw: 'Ngoan', polished: 'Ngoan' }],
        absentStudentIds: ['s2'],
      })),
    })
    render(<SessionComposer cls={clsWithTwo} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/nội dung bài học/i))
    fireEvent.click(screen.getByText(/xem trước/i))
    const pre = await screen.findByLabelText(/xem trước zalo/i)
    expect(pre.textContent).toContain('An: Ngoan')
    expect(pre.textContent).toContain('Bình: nghỉ')
  })

  it('gửi LMS thành công -> lưu content với postedToLms=true', async () => {
    const api = stub({
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({ posted: ['An'], skipped: [], absentStudentNames: [] })),
    })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByText(/gửi lên lms/i))
    fireEvent.click(screen.getByText(/gửi lên lms/i))
    await waitFor(() => expect(api.lmsPostSession).toHaveBeenCalled())
    await waitFor(() => expect(api.saveContent).toHaveBeenCalledWith(
      expect.objectContaining({ postedToLms: true }),
    ))
  })

  it('tách kết quả LMS thành nhận xét, học sinh nghỉ và lỗi kỹ thuật không lặp', async () => {
    const api = stub({
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({
        posted: ['An'],
        skipped: ['Nguyễn Sách Sâm', 'Phạm Bá Long (lỗi: timeout)'],
        absentStudentNames: ['Sách Sâm'],
      })),
    })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /gửi lên lms/i }))

    fireEvent.click(screen.getByRole('button', { name: /gửi lên lms/i }))

    expect(await screen.findByText('Đã nhận xét: An')).toBeInTheDocument()
    expect(screen.getByText('Học sinh nghỉ: Sách Sâm')).toBeInTheDocument()
    expect(screen.getByText('Bỏ qua do lỗi/thiếu nội dung: Phạm Bá Long (lỗi: timeout)')).toBeInTheDocument()
    expect(api.saveContent).toHaveBeenCalled()
  })

  it('chỉ dựng lại preview đang mở sau khi LMS trả kết quả và content đã lưu', async () => {
    const clsWithTwo: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Nguyễn Sách Sâm' }],
      sessions: [],
    }
    let resolveLms!: (result: {
      posted: string[]
      skipped: string[]
      absentStudentNames: string[]
    }) => void
    const lmsResult = new Promise<{
      posted: string[]
      skipped: string[]
      absentStudentNames: string[]
    }>(resolve => { resolveLms = resolve })
    let resolveSave!: () => void
    const saveResult = new Promise<void>(resolve => { resolveSave = resolve })
    const api = stub({
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(() => lmsResult),
      saveContent: vi.fn(() => saveResult),
    })
    render(<SessionComposer cls={clsWithTwo} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^nhận xét An$/i))
    fireEvent.change(screen.getByLabelText(/nội dung bài học/i), { target: { value: 'Bài gốc' } })
    fireEvent.change(screen.getByLabelText(/^nhận xét An$/i), { target: { value: 'Ngoan' } })
    fireEvent.change(screen.getByLabelText(/nhận xét Nguyễn Sách Sâm/i), { target: { value: 'Chăm' } })
    fireEvent.change(screen.getByLabelText(/bài tập về nhà/i), { target: { value: 'BT gốc' } })
    fireEvent.click(screen.getByText(/xem trước/i))
    const pre = await screen.findByLabelText(/xem trước zalo/i)
    expect(pre.textContent).toContain('Nguyễn Sách Sâm: Chăm')

    fireEvent.click(screen.getByText(/gửi lên lms/i))
    await waitFor(() => expect(api.lmsPostSession).toHaveBeenCalled())
    expect(screen.getByLabelText(/nội dung bài học/i)).toBeDisabled()
    expect(screen.getByLabelText(/^nhận xét An$/i)).toBeDisabled()
    expect(screen.getByLabelText(/nhận xét Nguyễn Sách Sâm/i)).toBeDisabled()
    expect(screen.getByLabelText(/bài tập về nhà/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^lưu$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /sửa tất cả bằng AI/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /nạp PDF/i })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/nội dung bài học/i), { target: { value: 'Bài bị sửa' } })
    fireEvent.change(screen.getByLabelText(/^nhận xét An$/i), { target: { value: 'Bị mất' } })
    fireEvent.change(screen.getByLabelText(/bài tập về nhà/i), { target: { value: 'BT bị sửa' } })
    expect(screen.getByLabelText(/nội dung bài học/i)).toHaveValue('Bài gốc')
    expect(screen.getByLabelText(/^nhận xét An$/i)).toHaveValue('Ngoan')
    expect(screen.getByLabelText(/bài tập về nhà/i)).toHaveValue('BT gốc')
    expect(pre.textContent).toContain('Nguyễn Sách Sâm: Chăm')

    resolveLms({
      posted: ['An'],
      skipped: ['Nguyễn Sách Sâm'],
      absentStudentNames: ['Sách Sâm'],
    })
    await waitFor(() => expect(api.saveContent).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonContent: 'Bài gốc',
        homework: 'BT gốc',
        absentStudentIds: ['s2'],
        postedToLms: true,
      }),
    ))
    expect(pre.textContent).toContain('Nguyễn Sách Sâm: Chăm')

    resolveSave()
    await waitFor(() => expect(pre.textContent).toContain('Nguyễn Sách Sâm: nghỉ'))
    expect(pre.textContent).toContain('An: Ngoan')
  })

  it('gửi LMS lỗi -> không đánh dấu postedToLms', async () => {
    const api = stub({
      lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
      lmsPostSession: vi.fn(async () => ({
        posted: [], skipped: [], absentStudentNames: [], error: 'Lỗi kết nối',
      })),
    })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByText(/gửi lên lms/i))
    fireEvent.click(screen.getByText(/gửi lên lms/i))
    await waitFor(() => expect(api.lmsPostSession).toHaveBeenCalled())
    expect(api.saveContent).not.toHaveBeenCalled()
  })

  it('AI sửa thất bại hiển thị lỗi', async () => {
    stub({ rewriteCommentsBatch: vi.fn(async () => { throw new Error('Chưa cấu hình API key Gemini') }) })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/^nhận xét An$/i))
    fireEvent.change(screen.getByLabelText(/^nhận xét An$/i), { target: { value: 'ngoan' } })
    fireEvent.click(screen.getByText(/sửa tất cả bằng AI/i))
    await waitFor(() => expect(screen.getByText(/chưa cấu hình api key/i)).toBeInTheDocument())
  })

  it('buổi #4 bị khóa gửi LMS: nút bị vô hiệu + hiện thông báo', async () => {
    const clsWith4: SchoolClass = {
      id: 'c1', code: 'A1', name: 'Lớp A1',
      students: [{ id: 's1', name: 'An' }],
      sessions: [
        { id: 'b1', dateTime: '2026-07-01T14:00:00' },
        { id: 'b2', dateTime: '2026-07-03T14:00:00' },
        { id: 'b3', dateTime: '2026-07-05T14:00:00' },
        { id: 'b4', dateTime: '2026-07-08T14:00:00' },
      ],
    }
    const s4: ClassSession = { id: 'b4', dateTime: '2026-07-08T14:00:00' }
    render(<SessionComposer cls={clsWith4} session={s4} onDone={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /gửi lên lms/i }))
    expect(screen.getByRole('button', { name: /gửi lên lms/i })).toBeDisabled()
    expect(screen.getByText(/cơ chế đặc biệt/i)).toBeInTheDocument()
  })
})
