import { useEffect, useState } from 'react'
import {
  AutoSendConfig,
  AutoSendCatchUpItem,
  AutoSendCatchUpResult,
  SchoolClass,
  ClassSession,
  SessionContent,
  LmsScrapedClass,
} from '../../../shared/types'
import { newId } from '../../../shared/id'
import { formatSessionDate } from '../../../shared/zaloTemplate'
import { getClassStatus, ClassStatus } from '../../../shared/classStatus'
import {
  ALL_CLASS_PROGRAMS,
  ClassListFilters,
  NamedClassProgram,
  DEFAULT_CLASS_FILTERS,
  filterClasses,
} from '../../../shared/classFilters'
import { computeContentTargets, mergeContentResult, detectDroppedOut } from '../../../shared/lmsSync'
import { getSessionContentStatus, findPreviousSession, copySessionContent, getClassProgress, SessionContentStatus } from '../../../shared/sessionContent'
import ClassEditor from './ClassEditor'
import SessionComposer from './SessionComposer'
import ConfirmDialog from '../components/ConfirmDialog'
import { EditIcon, TrashIcon } from '../components/Icons'

function emptyClass(): SchoolClass {
  return { id: newId(), code: '', name: '', students: [], sessions: [] }
}

const STATUS_STYLE: Record<ClassStatus, { background: string; color: string }> = {
  'chưa bắt đầu': { background: '#e3f2fd', color: '#1565c0' },
  'đang diễn ra':  { background: '#e8f5e9', color: '#2e7d32' },
  'đã kết thúc':   { background: '#f5f5f5', color: '#757575' },
}

const CONTENT_STATUS_STYLE: Record<SessionContentStatus, { background: string; color: string }> = {
  'chưa có nội dung': { background: '#f2f4f7', color: '#667085' },
  'đã soạn nội dung': { background: '#fff3e0', color: '#e65100' },
  'đã nhận xét':      { background: '#e8f5e9', color: '#2e7d32' },
}

const CATCH_UP_RESULT_LABEL: Record<AutoSendCatchUpResult['status'], string> = {
  success: 'thành công',
  skipped: 'bỏ qua',
  error: 'lỗi',
}

const STATUS_FILTER_LABEL: Record<ClassStatus, string> = {
  'chưa bắt đầu': 'Chưa bắt đầu',
  'đang diễn ra': 'Đang diễn ra',
  'đã kết thúc': 'Đã kết thúc',
}

const PROGRAM_FILTER_LABEL: Record<NamedClassProgram, string> = {
  robotics: 'Robotics',
  game: 'Game',
  web: 'Web',
  scratch: 'Scratch',
}

export default function ClassesPage({ active = true }: { active?: boolean }): JSX.Element {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SchoolClass | null>(null)
  const [composing, setComposing] = useState<{ cls: SchoolClass; session: ClassSession } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncPreview, setSyncPreview] = useState<LmsScrapedClass[] | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [sessionContents, setSessionContents] = useState<Map<string, SessionContent>>(new Map())
  const [syncSummary, setSyncSummary] = useState<{ updated: number; skipped: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SchoolClass | null>(null)
  const [savingSchedules, setSavingSchedules] = useState<Set<string>>(new Set())
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [catchUpItems, setCatchUpItems] = useState<AutoSendCatchUpItem[]>([])
  const [catchUpResults, setCatchUpResults] = useState<AutoSendCatchUpResult[]>([])
  const [catchUpOpen, setCatchUpOpen] = useState(true)
  const [catchUpRunning, setCatchUpRunning] = useState(false)
  const [classFilters, setClassFilters] = useState<ClassListFilters>(() => ({
    statuses: new Set(DEFAULT_CLASS_FILTERS.statuses),
    programs: new Set(DEFAULT_CLASS_FILTERS.programs),
  }))
  const visibleClasses = filterClasses(classes, classFilters)

  const reload = async (): Promise<void> => {
    try {
      const list = await window.api.listClasses()
      setClasses(list)
      setError(null)
      // Nạp nội dung đã lưu của mọi buổi (mọi lớp) — dùng để hiện trạng thái và sao chép buổi trước
      const allIds = list.flatMap(c => c.sessions.map(s => s.id))
      const results = await Promise.all(allIds.map(id => window.api.getContent(id)))
      const map = new Map<string, SessionContent>()
      allIds.forEach((id, i) => { const content = results[i]; if (content) map.set(id, content) })
      setSessionContents(map)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Tải lại khi tab được mở (active) và không đang soạn/sửa — để nhận thư mục vừa cấu hình.
  useEffect(() => {
    if (active && !editing && !composing) void reload()
  }, [active, editing, composing])

  useEffect(() => {
    void window.api.getAutoSendCatchUp()
      .then(setCatchUpItems)
      .catch(err => setError(`Không đọc được lịch gửi bù: ${(err as Error).message}`))
  }, [])

  const syncFromLms = async (): Promise<void> => {
    setSyncing(true)
    setSyncError(null)
    setSyncSummary(null)
    try {
      const { loggedIn } = await window.api.lmsOpenBrowser()
      if (!loggedIn) {
        setSyncError('Hết thời gian chờ đăng nhập LMS (3 phút). Thử lại sau khi đăng nhập.')
        return
      }
      const existingCodes = classes.map(c => c.code)
      const contentTargets = computeContentTargets(classes, id => sessionContents.has(id))

      const { newClasses, contentResults, skippedClasses } = await window.api.lmsSyncAll({
        existingCodes,
        contentTargets,
      })

      for (const result of contentResults) {
        const cls = classes.find(c => c.code === result.classCode)
        const target = contentTargets.find(t => t.classCode === result.classCode)
        const session = cls?.sessions.find(s => s.id === target?.sessionId)
        if (cls && session) {
          // Giữ nội dung app đã soạn (nếu có), chỉ cập nhật điểm danh từ LMS.
          const existing = sessionContents.get(session.id)
          await window.api.saveContent(mergeContentResult(cls, session, result, existing))

          // Cập nhật nghỉ dài hạn: HS không còn trên bảng nhận xét LMS → droppedOut.
          const flags = detectDroppedOut(cls.students, result.students.map(s => s.name))
          const flagById = new Map(flags.map(f => [f.id, f.droppedOut]))
          const changed = cls.students.some(
            s => Boolean(s.droppedOut) !== Boolean(flagById.get(s.id)),
          )
          if (changed) {
            await window.api.saveClass({
              ...cls,
              students: cls.students.map(s => ({ ...s, droppedOut: flagById.get(s.id) ?? false })),
            })
          }
        }
      }

      setSyncPreview(newClasses)
      setSyncSummary({ updated: contentResults.length, skipped: skippedClasses.length })
      if (contentResults.length > 0) await reload()
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const importScraped = async (scraped: LmsScrapedClass[]): Promise<void> => {
    for (const sc of scraped) {
      const existing = classes.find(c => c.code === sc.lmsCode)
      const cls: SchoolClass = existing ?? {
        id: newId(),
        code: sc.lmsCode,
        name: sc.name,
        students: [],
        sessions: [],
      }
      // Thêm sinh viên mới (không xoá sinh viên cũ)
      const newStudents = sc.students
        .filter(s => !cls.students.some(e => e.name === s.name))
        .map(s => ({ id: newId(), name: s.name }))
      // Thêm buổi mới (không xoá buổi cũ) — dùng giờ thật từ LMS nếu có, mặc định 14:00
      const newSessions = sc.sessions
        .filter(s => !cls.sessions.some(e => e.dateTime.startsWith(s.date)))
        .map(s => ({ id: newId(), dateTime: `${s.date}T${s.time ?? '14:00'}:00` }))
      await window.api.saveClass({
        ...cls,
        students: [...cls.students, ...newStudents],
        sessions: [...cls.sessions, ...newSessions],
      })
    }
    setSyncPreview(null)
    await reload()
  }

  const confirmRemove = async (): Promise<void> => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await window.api.deleteClass(id)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const copyFromPrevious = async (cls: SchoolClass, session: ClassSession): Promise<void> => {
    const prev = findPreviousSession(cls.sessions, session.id)
    const prevContent = prev ? sessionContents.get(prev.id) : undefined
    if (!prevContent) return
    try {
      await window.api.saveContent(copySessionContent(session, cls.id, prevContent))
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const saveSchedule = async (
    cls: SchoolClass,
    patch: Partial<AutoSendConfig>,
  ): Promise<void> => {
    const autoSend: AutoSendConfig = {
      time: cls.autoSend?.time ?? '18:00',
      lmsEnabled: cls.autoSend?.lmsEnabled ?? false,
      zaloEnabled: cls.autoSend?.zaloEnabled ?? false,
      dayOffset: cls.autoSend?.dayOffset ?? 'same',
      ...patch,
    }
    const updated = { ...cls, autoSend }
    setClasses(items => items.map(item => item.id === cls.id ? updated : item))
    setSavingSchedules(ids => new Set(ids).add(cls.id))
    try {
      await window.api.saveClass(updated)
      setScheduleError(null)
    } catch (err) {
      setClasses(items => items.map(item => item.id === cls.id ? cls : item))
      setScheduleError(
        `Không lưu được lịch tự động của ${cls.code}: ${(err as Error).message}`,
      )
    } finally {
      setSavingSchedules(ids => {
        const next = new Set(ids)
        next.delete(cls.id)
        return next
      })
    }
  }

  const runCatchUp = async (): Promise<void> => {
    setCatchUpRunning(true)
    try {
      const results = await window.api.runAutoSendCatchUp()
      setCatchUpResults(results)
      setCatchUpItems([])
      setCatchUpOpen(false)
      await reload()
    } catch (err) {
      setError(`Không chạy được gửi bù: ${(err as Error).message}`)
    } finally {
      setCatchUpRunning(false)
    }
  }

  const allStatuses = Object.keys(STATUS_FILTER_LABEL) as ClassStatus[]
  const statusFilterValue =
    classFilters.statuses.size === 1 ? [...classFilters.statuses][0] : 'all'
  const selectStatus = (value: string): void => {
    setClassFilters(current => ({
      ...current,
      statuses: value === 'all'
        ? new Set(allStatuses)
        : new Set([value as ClassStatus]),
    }))
  }

  const toggleProgram = (program: NamedClassProgram): void => {
    setClassFilters(current => {
      const programs = new Set(current.programs)
      if (programs.has(program)) programs.delete(program)
      else programs.add(program)
      return { ...current, programs }
    })
  }

  if (composing) {
    return <SessionComposer cls={composing.cls} session={composing.session} onDone={() => setComposing(null)} />
  }

  if (editing) {
    return <ClassEditor cls={editing} onDone={() => setEditing(null)} />
  }

  return (
    <div className="page">
      <div className="row-between" style={{ marginBottom: 20 }}>
        <h1>Lớp học</h1>
        <div className="btn-row">
          <button className="btn" onClick={() => void reload()}>Tải lại</button>
          <button className="btn" onClick={() => setEditing(emptyClass())}>+ Thêm lớp</button>
          <button className="btn btn-primary" onClick={() => void syncFromLms()} disabled={syncing}>
            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ LMS'}
          </button>
        </div>
      </div>

      {error && (
        <p className="alert alert-error">
          Không tải được danh sách lớp: {error}. Hãy chọn thư mục lưu dữ liệu trong tab Cấu hình.
        </p>
      )}
      {syncError && <p className="alert alert-error">Lỗi kết nối LMS: {syncError}</p>}
      {scheduleError && <p className="alert alert-error">{scheduleError}</p>}

      {syncSummary && (
        <p className="alert alert-info">
          Đã cập nhật nội dung {syncSummary.updated} buổi
          {syncSummary.skipped > 0 ? `, bỏ qua ${syncSummary.skipped} lớp (LMS chưa có nội dung buổi mới nhất)` : ''}.
        </p>
      )}

      {catchUpOpen && catchUpItems.length > 0 && (
        <div className="card card-pad catch-up-card">
          <strong>Có lịch gửi bị bỏ lỡ</strong>
          <p className="text-muted catch-up-description">
            App chưa chạy tại giờ hẹn. Kiểm tra danh sách rồi xác nhận gửi bù.
          </p>
          <ul className="catch-up-list">
            {catchUpItems.map(item => (
              <li key={`${item.classId}:${item.sessionId}`}>
                <strong>{item.classCode} — {item.className}</strong>
                <span>{formatSessionDate(item.sessionDateTime)}</span>
                <span>{item.channels.map(channel =>
                  channel === 'lms' ? 'LMS' : 'Zalo'
                ).join(', ')}</span>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              disabled={catchUpRunning}
              onClick={() => void runCatchUp()}
            >
              {catchUpRunning ? 'Đang gửi bù...' : 'Gửi bù tất cả'}
            </button>
            <button
              className="btn"
              disabled={catchUpRunning}
              onClick={() => setCatchUpOpen(false)}
            >
              Để sau
            </button>
          </div>
        </div>
      )}

      {catchUpResults.length > 0 && (
        <div className="card card-pad catch-up-results">
          <strong>Kết quả gửi bù</strong>
          <ul className="catch-up-list">
            {catchUpResults.map(result => (
              <li
                key={`${result.classId}:${result.sessionId}`}
                className={`catch-up-result-${result.status}`}
              >
                <strong>
                  {result.classCode}: {CATCH_UP_RESULT_LABEL[result.status]}
                </strong>
                <span>{result.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {syncPreview && (
        <div className="section">
          <strong>Tìm thấy {syncPreview.length} lớp từ LMS:</strong>
          <ul style={{ margin: '10px 0 14px', paddingLeft: 20, fontSize: 13 }}>
            {syncPreview.map(sc => (
              <li key={sc.lmsCode} style={{ marginBottom: 4 }}>
                <strong>{sc.lmsCode}</strong> — {sc.name}
                {' '}<span className="text-muted">({sc.students.length} HS, {sc.sessions.length} buổi)</span>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => void importScraped(syncPreview)}>Nhập tất cả vào app</button>
            <button className="btn" onClick={() => setSyncPreview(null)}>Hủy</button>
          </div>
        </div>
      )}

      <div className="card card-pad class-filter-bar">
        <div className="class-filter-group">
          <strong>Trạng thái</strong>
          <select
            className="input input-auto class-filter-select"
            aria-label="Lọc theo trạng thái"
            value={statusFilterValue}
            onChange={e => selectStatus(e.target.value)}
          >
            <option value="all">Tất cả</option>
            {(Object.keys(STATUS_FILTER_LABEL) as ClassStatus[]).map(status => (
              <option key={status} value={status}>{STATUS_FILTER_LABEL[status]}</option>
            ))}
          </select>
        </div>
        <div className="class-filter-group programs">
          <strong>Loại lớp</strong>
          {ALL_CLASS_PROGRAMS.map(program => (
            <label className="check compact" key={program}>
              <input
                type="checkbox"
                aria-label={`Lọc loại ${PROGRAM_FILTER_LABEL[program]}`}
                checked={classFilters.programs.has(program)}
                onChange={() => toggleProgram(program)}
              />
              {PROGRAM_FILTER_LABEL[program]}
            </label>
          ))}
        </div>
        <span className="class-filter-count">
          Đang xem {visibleClasses.length}/{classes.length} lớp
        </span>
      </div>

      {!error && classes.length === 0 && !syncPreview && (
        <div className="card card-pad text-muted">Chưa có lớp nào.</div>
      )}
      {!error && classes.length > 0 && visibleClasses.length === 0 && (
        <div className="card card-pad text-muted">
          Không có lớp phù hợp với bộ lọc.
        </div>
      )}

      <div className="stack">
        {visibleClasses.map(c => (
          <div key={c.id} className="card card-pad">
            <div className="row-between">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 15 }}>{c.code}</strong>
                  <span className="text-muted">{c.name}</span>
                  {(() => {
                    const status = getClassStatus(c.sessions)
                    const s = STATUS_STYLE[status]
                    return (
                      <span className="badge" style={{ background: s.background, color: s.color }}>
                        {status}
                      </span>
                    )
                  })()}
                </div>
                <div className="text-muted" style={{ fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{c.students.length} học sinh · {c.sessions.length} buổi</span>
                  {(() => {
                    const p = getClassProgress(c.sessions, id => sessionContents.get(id))
                    if (p.total === 0) return null
                    const pct = Math.round((p.past / p.total) * 100)
                    return (
                      <>
                        <span>· đã qua {p.past}/{p.total} buổi</span>
                        <span className="progress-mini"><span style={{ width: `${pct}%` }} /></span>
                      </>
                    )
                  })()}
                </div>
              </div>
              <div className="btn-row">
                <div className="auto-send-controls" aria-label={`Lịch tự động ${c.code}`}>
                  <span className="auto-send-caption">Tự động gửi</span>
                  <select
                    className="input input-auto auto-send-day"
                    aria-label={`Ngày gửi tự động ${c.code}`}
                    value={c.autoSend?.dayOffset ?? 'same'}
                    disabled={savingSchedules.has(c.id)}
                    onChange={event => void saveSchedule(c, {
                      dayOffset: event.target.value as 'same' | 'next',
                    })}
                  >
                    <option value="same">cùng ngày buổi học</option>
                    <option value="next">ngày hôm sau buổi học</option>
                  </select>
                  <span className="auto-send-caption">lúc</span>
                  <input
                    type="time"
                    className="input input-auto auto-send-time"
                    aria-label={`Giờ tự động ${c.code}`}
                    value={c.autoSend?.time ?? '18:00'}
                    disabled={savingSchedules.has(c.id)}
                    onChange={event => void saveSchedule(c, { time: event.target.value })}
                  />
                  <label className="check compact">
                    <input
                      type="checkbox"
                      aria-label={`Tự động LMS ${c.code}`}
                      checked={c.autoSend?.lmsEnabled ?? false}
                      disabled={savingSchedules.has(c.id)}
                      onChange={event => void saveSchedule(c, { lmsEnabled: event.target.checked })}
                    />
                    LMS
                  </label>
                  <label className="check compact">
                    <input
                      type="checkbox"
                      aria-label={`Tự động Zalo ${c.code}`}
                      checked={c.autoSend?.zaloEnabled ?? false}
                      disabled={savingSchedules.has(c.id)}
                      onChange={event => void saveSchedule(c, { zaloEnabled: event.target.checked })}
                    />
                    Zalo
                  </label>
                </div>
                <button className="btn btn-icon-box" aria-label={`Sửa lớp ${c.code}`} title="Sửa lớp" onClick={() => setEditing(c)}><EditIcon /></button>
                <button className="btn btn-icon-box danger" aria-label={`Xóa lớp ${c.code}`} title="Xóa lớp" onClick={() => setPendingDelete(c)}><TrashIcon /></button>
              </div>
            </div>
            {c.sessions.length > 0 && (
              <>
                <hr className="divider" />
                <div className="text-muted" style={{ fontSize: 12, marginBottom: 8, fontWeight: 550 }}>Nội dung theo buổi</div>
                <div className="stack" style={{ gap: 6 }}>
                  {(() => {
                    // Đánh số buổi theo thứ tự thời gian (#1 = buổi sớm nhất)
                    const orderedIds = [...c.sessions]
                      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
                      .map(s => s.id)
                    return c.sessions.map(ss => {
                    const content = sessionContents.get(ss.id) ?? null
                    const status = getSessionContentStatus(content)
                    const cs = CONTENT_STATUS_STYLE[status]
                    const prev = findPreviousSession(c.sessions, ss.id)
                    const prevContent = prev ? sessionContents.get(prev.id) : undefined
                    const canCopy = status === 'chưa có nội dung' && !!prevContent
                    const isPast = new Date(ss.dateTime) < new Date()
                    const num = orderedIds.indexOf(ss.id) + 1
                    const rowClass = isPast
                      ? (status === 'đã nhận xét' ? 'session-row is-past-done' : 'session-row is-past-todo')
                      : 'session-row'
                    return (
                      <div key={ss.id} className={rowClass}>
                        <span className="session-num">#{num}</span>
                        <span className="session-date">{formatSessionDate(ss.dateTime) || 'Buổi chưa đặt giờ'}</span>
                        <span className="badge" style={{ background: cs.background, color: cs.color }}>{status}</span>
                        <button
                          className="btn btn-sm btn-session"
                          aria-label={`Soạn nội dung ${c.code} ${formatSessionDate(ss.dateTime) || ss.id}`}
                          onClick={() => setComposing({ cls: c, session: ss })}
                        >
                          {status === 'chưa có nội dung' ? 'Soạn nội dung' : 'Xem/Sửa nội dung'}
                        </button>
                        <span className="session-secondary-action">
                          {canCopy && (
                            <button
                              className="btn btn-sm"
                              aria-label={`Sao chép buổi trước ${c.code} ${formatSessionDate(ss.dateTime) || ss.id}`}
                              onClick={() => void copyFromPrevious(c, ss)}
                            >
                              Sao chép buổi trước
                            </button>
                          )}
                        </span>
                      </div>
                    )
                    })
                  })()}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Xóa lớp học"
          message={`Xóa lớp "${pendingDelete.code} — ${pendingDelete.name}"? Toàn bộ học sinh và buổi học của lớp sẽ bị xóa. Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa lớp"
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
