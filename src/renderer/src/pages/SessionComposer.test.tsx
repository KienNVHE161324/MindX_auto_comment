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
    expect(screen.getByLabelText(/nhận xét thô An/i)).toBeInTheDocument()
  })

  it('tải nội dung đã lưu nếu có', async () => {
    stub({ getContent: vi.fn(async () => ({
      id: 'ss1', classId: 'c1', sessionId: 'ss1', lessonContent: 'Đã lưu', homework: 'BT', comments: [],
    })) })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/nội dung bài học/i)).toHaveValue('Đã lưu'))
  })

  it('"Nạp PDF & trích" điền nội dung bài học', async () => {
    const api = stub()
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByText(/nạp pdf/i))
    fireEvent.click(screen.getByText(/nạp pdf/i))
    await waitFor(() => expect(screen.getByLabelText(/nội dung bài học/i)).toHaveValue('Bài học từ PDF'))
    expect(api.extractLessonFromPdf).toHaveBeenCalled()
  })

  it('"AI sửa" điền nhận xét đã sửa', async () => {
    const api = stub()
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/nhận xét thô An/i))
    fireEvent.change(screen.getByLabelText(/nhận xét thô An/i), { target: { value: 'ngoan' } })
    fireEvent.click(screen.getByLabelText(/AI sửa An/i))
    await waitFor(() => expect(screen.getByLabelText(/nhận xét đã sửa An/i)).toHaveValue('Em An ngoan, tích cực.'))
    expect(api.rewriteComment).toHaveBeenCalledWith('An', 'ngoan')
  })

  it('"Xem trước" dựng tin Zalo có tên lớp, bài học, nhận xét, bài tập', async () => {
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/nhận xét thô An/i))
    fireEvent.change(screen.getByLabelText(/nội dung bài học/i), { target: { value: 'Phép cộng' } })
    fireEvent.change(screen.getByLabelText(/nhận xét thô An/i), { target: { value: 'ngoan' } })
    fireEvent.change(screen.getByLabelText(/bài tập về nhà/i), { target: { value: 'Làm bài 5' } })
    fireEvent.click(screen.getByText(/xem trước/i))
    const pre = await screen.findByLabelText(/xem trước zalo/i)
    expect(pre.textContent).toContain('lớp Lớp A1 ngày 20/07/2026 18:00')
    expect(pre.textContent).toContain('Phép cộng')
    expect(pre.textContent).toContain('An: ngoan')
    expect(pre.textContent).toContain('Làm bài 5')
  })

  it('"Lưu" gọi saveContent', async () => {
    const api = stub()
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByText(/^lưu$/i))
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(api.saveContent).toHaveBeenCalled())
    expect(screen.getByText(/đã lưu/i)).toBeInTheDocument()
  })

  it('AI sửa thất bại hiển thị lỗi', async () => {
    stub({ rewriteComment: vi.fn(async () => { throw new Error('Chưa cấu hình API key Gemini') }) })
    render(<SessionComposer cls={cls} session={session} onDone={() => {}} />)
    await waitFor(() => screen.getByLabelText(/AI sửa An/i))
    fireEvent.click(screen.getByLabelText(/AI sửa An/i))
    await waitFor(() => expect(screen.getByText(/chưa cấu hình api key/i)).toBeInTheDocument())
  })
})
