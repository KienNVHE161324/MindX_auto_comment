import { useEffect, useState } from 'react'
import { SchoolClass, ClassSession, LmsScrapedClass } from '../../../shared/types'
import { newId } from '../../../shared/id'
import { formatSessionDate } from '../../../shared/zaloTemplate'
import ClassEditor from './ClassEditor'
import SessionComposer from './SessionComposer'

function emptyClass(): SchoolClass {
  return { id: newId(), code: '', name: '', students: [], sessions: [] }
}

export default function ClassesPage({ active = true }: { active?: boolean }): JSX.Element {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SchoolClass | null>(null)
  const [composing, setComposing] = useState<{ cls: SchoolClass; session: ClassSession } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncPreview, setSyncPreview] = useState<LmsScrapedClass[] | null>(null)

  const reload = async (): Promise<void> => {
    try {
      setClasses(await window.api.listClasses())
      setError(null)
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
    setError(null)
    try {
      const { loggedIn } = await window.api.lmsOpenBrowser()
      if (!loggedIn) {
        setError('Chưa đăng nhập LMS. Đăng nhập trong cửa sổ trình duyệt rồi thử lại.')
        return
      }
      const { classes: scraped } = await window.api.lmsSyncClasses()
      setSyncPreview(scraped)
    } catch (err) {
      setError((err as Error).message)
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
            {syncing ? 'Đang tải từ LMS...' : 'Tự động thêm lớp từ LMS'}
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: 'crimson' }}>
          Không tải được danh sách lớp: {error}. Hãy chọn thư mục lưu dữ liệu trong tab Cấu hình.
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
                <strong>{c.code}</strong> — {c.name}
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
                {c.sessions.map(ss => (
                  <div key={ss.id} style={{ marginTop: 4 }}>
                    <span style={{ fontSize: 13 }}>{formatSessionDate(ss.dateTime) || 'Buổi chưa đặt giờ'}</span>{' '}
                    <button aria-label={`Soạn nội dung ${c.code} ${formatSessionDate(ss.dateTime) || ss.id}`} onClick={() => setComposing({ cls: c, session: ss })}>
                      Soạn nội dung
                    </button>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
