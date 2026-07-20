import { useEffect, useState } from 'react'
import { SchoolClass, ClassSession, SessionContent, LmsScrapedClass } from '../../../shared/types'
import { newId } from '../../../shared/id'
import { formatSessionDate } from '../../../shared/zaloTemplate'
import { getClassStatus, ClassStatus } from '../../../shared/classStatus'
import { computeContentTargets, mergeContentResult } from '../../../shared/lmsSync'
import { getSessionContentStatus, findPreviousSession, copySessionContent, SessionContentStatus } from '../../../shared/sessionContent'
import ClassEditor from './ClassEditor'
import SessionComposer from './SessionComposer'

function emptyClass(): SchoolClass {
  return { id: newId(), code: '', name: '', students: [], sessions: [] }
}

const STATUS_STYLE: Record<ClassStatus, { background: string; color: string }> = {
  'chưa bắt đầu': { background: '#e3f2fd', color: '#1565c0' },
  'đang diễn ra':  { background: '#e8f5e9', color: '#2e7d32' },
  'đã kết thúc':   { background: '#f5f5f5', color: '#757575' },
}

const CONTENT_STATUS_STYLE: Record<SessionContentStatus, { background: string; color: string }> = {
  'chưa có nội dung': { background: '#f5f5f5', color: '#757575' },
  'đã soạn nội dung': { background: '#fff3e0', color: '#e65100' },
  'đã nhận xét':      { background: '#e8f5e9', color: '#2e7d32' },
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
          await window.api.saveContent(mergeContentResult(cls, session, result))
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
      // Thêm buổi mới (không xoá buổi cũ)
      const newSessions = sc.sessions
        .filter(s => !cls.sessions.some(e => e.dateTime.startsWith(s.date)))
        .map(s => ({ id: newId(), dateTime: `${s.date}T14:00:00` }))
      await window.api.saveClass({
        ...cls,
        students: [...cls.students, ...newStudents],
        sessions: [...cls.sessions, ...newSessions],
      })
    }
    setSyncPreview(null)
    await reload()
  }

  const remove = async (id: string): Promise<void> => {
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

  if (composing) {
    return <SessionComposer cls={composing.cls} session={composing.session} onDone={() => setComposing(null)} />
  }

  if (editing) {
    return <ClassEditor cls={editing} onDone={() => setEditing(null)} />
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Lớp học</h1>
        <div>
          <button onClick={() => void reload()}>Tải lại</button>{' '}
          <button onClick={() => setEditing(emptyClass())}>+ Thêm lớp</button>{' '}
          <button onClick={() => void syncFromLms()} disabled={syncing}>
            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ LMS'}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: 'crimson' }}>
          Không tải được danh sách lớp: {error}. Hãy chọn thư mục lưu dữ liệu trong tab Cấu hình.
        </p>
      )}
      {syncError && <p style={{ color: 'crimson' }}>Lỗi kết nối LMS: {syncError}</p>}

      {syncSummary && (
        <p style={{ color: '#555' }}>
          Đã cập nhật nội dung {syncSummary.updated} buổi
          {syncSummary.skipped > 0 ? `, bỏ qua ${syncSummary.skipped} lớp (LMS chưa có nội dung buổi mới nhất)` : ''}.
        </p>
      )}

      {syncPreview && (
        <div style={{ border: '1px solid #aaa', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f9f9f9' }}>
          <strong>Tìm thấy {syncPreview.length} lớp từ LMS:</strong>
          <ul style={{ margin: '8px 0 12px', paddingLeft: 20, fontSize: 13 }}>
            {syncPreview.map(sc => (
              <li key={sc.lmsCode}>
                <strong>{sc.lmsCode}</strong> — {sc.name}
                {' '}({sc.students.length} HS, {sc.sessions.length} buổi)
              </li>
            ))}
          </ul>
          <button onClick={() => void importScraped(syncPreview)}>Nhập tất cả vào app</button>{' '}
          <button onClick={() => setSyncPreview(null)}>Hủy</button>
        </div>
      )}

      {!error && classes.length === 0 && !syncPreview && <p>Chưa có lớp nào.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {classes.map(c => (
          <li key={c.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{c.code}</strong> — {c.name}
                  {(() => {
                    const status = getClassStatus(c.sessions)
                    const s = STATUS_STYLE[status]
                    return (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: s.background, color: s.color, fontWeight: 600,
                      }}>
                        {status}
                      </span>
                    )
                  })()}
                </div>
                <div style={{ color: '#666', fontSize: 13 }}>
                  {c.students.length} học sinh · {c.sessions.length} buổi
                </div>
              </div>
              <div>
                <button onClick={() => setEditing(c)}>Sửa</button>{' '}
                <button aria-label={`Xóa lớp ${c.code}`} onClick={() => remove(c.id)}>Xóa</button>
              </div>
            </div>
            {c.sessions.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13, color: '#666' }}>Soạn nội dung theo buổi:</div>
                {c.sessions.map(ss => {
                  const content = sessionContents.get(ss.id) ?? null
                  const status = getSessionContentStatus(content)
                  const cs = CONTENT_STATUS_STYLE[status]
                  const prev = findPreviousSession(c.sessions, ss.id)
                  const prevContent = prev ? sessionContents.get(prev.id) : undefined
                  const canCopy = status === 'chưa có nội dung' && !!prevContent
                  return (
                    <div key={ss.id} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>{formatSessionDate(ss.dateTime) || 'Buổi chưa đặt giờ'}</span>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: cs.background, color: cs.color, fontWeight: 600,
                      }}>
                        {status}
                      </span>
                      <button
                        aria-label={`Soạn nội dung ${c.code} ${formatSessionDate(ss.dateTime) || ss.id}`}
                        onClick={() => setComposing({ cls: c, session: ss })}
                      >
                        {status === 'chưa có nội dung' ? 'Soạn nội dung' : 'Xem/Sửa nội dung'}
                      </button>
                      {canCopy && (
                        <button
                          aria-label={`Sao chép buổi trước ${c.code} ${formatSessionDate(ss.dateTime) || ss.id}`}
                          onClick={() => void copyFromPrevious(c, ss)}
                        >
                          Sao chép buổi trước
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
