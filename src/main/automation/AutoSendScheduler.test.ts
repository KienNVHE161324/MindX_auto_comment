import { describe, it, expect, vi } from 'vitest'
import { AutoSendScheduler, AutoSendDeps } from './AutoSendScheduler'
import { SchoolClass, SessionContent, DEFAULT_CONFIG } from '../../shared/types'

const now = new Date('2026-07-17T19:00:00')

function makeCls(overrides: Partial<SchoolClass> = {}): SchoolClass {
  return {
    id: 'c1', code: 'A1', name: 'Lớp A1',
    students: [{ id: 's1', name: 'An' }],
    sessions: [{ id: 'ss1', dateTime: '2026-07-10T14:00:00' }],
    autoSend: { enabled: true, time: '18:00' },
    ...overrides,
  }
}

function makeContent(overrides: Partial<SessionContent> = {}): SessionContent {
  return {
    id: 'ss1', classId: 'c1', sessionId: 'ss1',
    lessonContent: 'Bài học', homework: 'BT',
    comments: [{ studentId: 's1', raw: 'Ngoan', polished: '' }],
    ...overrides,
  }
}

function makeDeps(overrides: Partial<AutoSendDeps> = {}): AutoSendDeps {
  const deps = {
    getClasses: vi.fn(async () => [] as SchoolClass[]),
    getContent: vi.fn(async () => null),
    updateContentMetadata: vi.fn(async () => null),
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    lmsOpenBrowser: vi.fn(async () => ({ loggedIn: true })),
    lmsPostSession: vi.fn(async () => ({
      posted: ['An'], skipped: [], absentStudentNames: [],
    })),
    writeZaloMessage: vi.fn(async () => {}),
    now: () => now,
    ...overrides,
  } as AutoSendDeps
  deps.runLmsPostExclusive = overrides.runLmsPostExclusive
    ?? (operation => operation(deps.lmsPostSession))
  return deps
}

describe('AutoSendScheduler.tick', () => {
  it('single-flight: hai tick chồng thời gian chỉ chạy một lượt', async () => {
    let releaseClasses!: () => void
    const classesBlocked = new Promise<void>(resolve => { releaseClasses = resolve })
    const getClasses = vi.fn(async () => {
      await classesBlocked
      return [] as SchoolClass[]
    })
    const scheduler = new AutoSendScheduler(makeDeps({ getClasses }))

    const first = scheduler.tick()
    const second = scheduler.tick()

    await Promise.resolve()
    expect(getClasses).toHaveBeenCalledTimes(1)
    releaseClasses()
    await Promise.all([first, second])

    await scheduler.tick()
    expect(getClasses).toHaveBeenCalledTimes(2)
  })

  it('đọc lại content sau khi chờ mở LMS và bỏ side effect nếu trạng thái đã được cập nhật', async () => {
    let releaseBrowser!: () => void
    const browserBlocked = new Promise<void>(resolve => { releaseBrowser = resolve })
    const initial = makeContent()
    const completed = makeContent({
      postedToLms: true,
      zaloSentAt: '2026-07-17T18:00:00.000Z',
    })
    const getContent = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(completed)
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent,
      lmsOpenBrowser: vi.fn(async () => {
        await browserBlocked
        return { loggedIn: true }
      }),
    })
    const pending = new AutoSendScheduler(deps).tick()

    await vi.waitFor(() => expect(deps.lmsOpenBrowser).toHaveBeenCalledOnce())
    releaseBrowser()
    await pending

    expect(getContent).toHaveBeenCalledTimes(2)
    expect(deps.lmsPostSession).not.toHaveBeenCalled()
    expect(deps.writeZaloMessage).not.toHaveBeenCalled()
    expect(deps.updateContentMetadata).not.toHaveBeenCalled()
  })

  it('đọc content bên trong shared LMS lock ngay trước post để không gửi plan stale', async () => {
    let releaseExclusive!: () => void
    const exclusiveBlocked = new Promise<void>(resolve => { releaseExclusive = resolve })
    const zaloSentAt = '2026-07-17T18:00:00.000Z'
    const initial = makeContent({ zaloSentAt })
    const completed = makeContent({ postedToLms: true, zaloSentAt })
    const getContent = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(completed)
    const enteredExclusive = vi.fn()
    const runLmsPostExclusive: AutoSendDeps['runLmsPostExclusive'] = async <T,>(
      operation: (postSession: AutoSendDeps['lmsPostSession']) => Promise<T>,
    ): Promise<T> => {
      enteredExclusive()
      await exclusiveBlocked
      return operation(deps.lmsPostSession)
    }
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent,
      runLmsPostExclusive,
    })
    const pending = new AutoSendScheduler(deps).tick()

    await vi.waitFor(() => expect(enteredExclusive).toHaveBeenCalledOnce())
    expect(getContent).toHaveBeenCalledTimes(1)
    releaseExclusive()
    await pending

    expect(getContent).toHaveBeenCalledTimes(2)
    expect(deps.lmsPostSession).not.toHaveBeenCalled()
  })

  it('lớp chưa bật autoSend -> không làm gì', async () => {
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls({ autoSend: { enabled: false, time: '18:00' } })]),
      getContent: vi.fn(async () => makeContent()),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.lmsPostSession).not.toHaveBeenCalled()
    expect(deps.writeZaloMessage).not.toHaveBeenCalled()
  })

  it('chưa có content cho buổi gần nhất -> không gửi gì', async () => {
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent: vi.fn(async () => null),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.lmsPostSession).not.toHaveBeenCalled()
    expect(deps.writeZaloMessage).not.toHaveBeenCalled()
  })

  it('đủ điều kiện -> gửi LMS + Zalo, lưu content với 2 cờ true', async () => {
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent: vi.fn(async () => makeContent()),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.lmsPostSession).toHaveBeenCalledWith(expect.objectContaining({ classCode: 'A1', sessionDate: '2026-07-10' }))
    expect(deps.writeZaloMessage).toHaveBeenCalledWith('A1', '2026-07-10', expect.any(String))
    expect(deps.updateContentMetadata).toHaveBeenCalledWith('ss1', {
      postedToLms: true,
      absentStudentIds: [],
    })
    expect(deps.updateContentMetadata).toHaveBeenCalledWith('ss1', {
      zaloSentAt: now.toISOString(),
    })
  })

  it('đã gửi LMS rồi -> chỉ gửi Zalo, không gọi lại lmsPostSession', async () => {
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent: vi.fn(async () => makeContent({ postedToLms: true })),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.lmsPostSession).not.toHaveBeenCalled()
    expect(deps.writeZaloMessage).toHaveBeenCalled()
  })

  it('đã gửi cả 2 kênh -> không gửi lại, không lưu', async () => {
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent: vi.fn(async () => makeContent({ postedToLms: true, zaloSentAt: '2026-07-17T18:00:00' })),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.lmsPostSession).not.toHaveBeenCalled()
    expect(deps.writeZaloMessage).not.toHaveBeenCalled()
    expect(deps.updateContentMetadata).not.toHaveBeenCalled()
  })

  it('gửi LMS lỗi -> không đánh dấu postedToLms nhưng vẫn thử gửi Zalo', async () => {
    const deps = makeDeps({
      getClasses: vi.fn(async () => [makeCls()]),
      getContent: vi.fn(async () => makeContent()),
      lmsPostSession: vi.fn(async () => ({
        posted: [], skipped: [], absentStudentNames: [], error: 'Mất kết nối',
      })),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.writeZaloMessage).toHaveBeenCalled()
    expect(deps.updateContentMetadata).toHaveBeenCalledTimes(1)
    expect(deps.updateContentMetadata).toHaveBeenCalledWith('ss1', {
      zaloSentAt: now.toISOString(),
    })
  })

  it('cùng tick: lưu HS nghỉ từ LMS trước khi dựng tin Zalo, kể cả chưa post được nhận xét nào', async () => {
    const clsWithTwo = makeCls({
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Nguyễn Sách Sâm' }],
    })
    const contentWithTwo = makeContent({
      comments: [
        { studentId: 's1', raw: 'Ngoan', polished: '' },
        { studentId: 's2', raw: 'Chăm', polished: '' },
      ],
    })
    const events: string[] = []
    const deps = makeDeps({
      getClasses: vi.fn(async () => [clsWithTwo]),
      getContent: vi.fn(async () => contentWithTwo),
      updateContentMetadata: vi.fn(async (_sessionId, patch) => {
        events.push(patch.zaloSentAt ? 'save:zalo' : 'save:lms')
        return { ...contentWithTwo, ...patch }
      }),
      lmsPostSession: vi.fn(async () => ({
        posted: [],
        skipped: ['Nguyễn Sách Sâm'],
        absentStudentNames: ['Sách Sâm'],
      })),
      writeZaloMessage: vi.fn(async () => { events.push('zalo') }),
    })

    await new AutoSendScheduler(deps).tick()

    expect(deps.writeZaloMessage).toHaveBeenCalledWith(
      'A1',
      '2026-07-10',
      expect.stringContaining('Nguyễn Sách Sâm: nghỉ'),
    )
    expect(deps.updateContentMetadata).toHaveBeenCalledWith('ss1', {
      absentStudentIds: ['s2'],
    })
    expect(events).toEqual(['save:lms', 'zalo', 'save:zalo'])
  })

  it('skip kỹ thuật không được suy diễn thành HS nghỉ', async () => {
    const clsWithTwo = makeCls({
      students: [{ id: 's1', name: 'An' }, { id: 's2', name: 'Bình' }],
    })
    const deps = makeDeps({
      getClasses: vi.fn(async () => [clsWithTwo]),
      getContent: vi.fn(async () => makeContent({
        comments: [
          { studentId: 's1', raw: 'Ngoan', polished: '' },
          { studentId: 's2', raw: 'Chăm', polished: '' },
        ],
      })),
      lmsPostSession: vi.fn(async () => ({
        posted: ['An'],
        skipped: ['Bình (lỗi: popup không mở)'],
        absentStudentNames: [],
      })),
    })

    await new AutoSendScheduler(deps).tick()

    const writeMock = deps.writeZaloMessage as unknown as ReturnType<typeof vi.fn>
    expect(writeMock.mock.calls[0][2]).toContain('Bình: Chăm')
    expect(writeMock.mock.calls[0][2]).not.toContain('Bình: nghỉ')
    expect(deps.updateContentMetadata).toHaveBeenCalledWith('ss1', {
      postedToLms: true,
      absentStudentIds: [],
    })
  })

  it('1 lớp lỗi không chặn lớp khác', async () => {
    const clsA = makeCls({ id: 'c1', code: 'A1' })
    const clsB = makeCls({ id: 'c2', code: 'B2', sessions: [{ id: 'ssB', dateTime: '2026-07-10T14:00:00' }] })
    const deps = makeDeps({
      getClasses: vi.fn(async () => [clsA, clsB]),
      getContent: vi.fn(async (sessionId: string) => (
        sessionId === 'ss1'
          ? (() => { throw new Error('lỗi đọc content') })()
          : { id: 'ssB', classId: 'c2', sessionId: 'ssB', lessonContent: 'x', homework: '', comments: [] }
      )),
    })
    await new AutoSendScheduler(deps).tick()
    expect(deps.writeZaloMessage).toHaveBeenCalledWith('B2', '2026-07-10', expect.any(String))
  })
})
