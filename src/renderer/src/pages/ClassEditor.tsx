import { useState } from 'react'
import { SchoolClass } from '../../../shared/types'
import { newId } from '../../../shared/id'

function splitDateTime(iso: string): { date: string; hour: string } {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})/)
  return m ? { date: m[1], hour: m[2] } : { date: '', hour: '' }
}
function combineDateTime(date: string, hour: string): string {
  if (!date) return ''
  return `${date}T${(hour || '00').padStart(2, '0')}:00:00`
}

export default function ClassEditor({ cls, onDone }: { cls: SchoolClass; onDone: () => void }): JSX.Element {
  const [draft, setDraft] = useState<SchoolClass>(cls)
  const [error, setError] = useState<string | null>(null)

  const setCode = (code: string): void => setDraft(prev => ({ ...prev, code }))
  const setName = (name: string): void => setDraft(prev => ({ ...prev, name }))

  const addStudent = (): void =>
    setDraft(prev => ({ ...prev, students: [...prev.students, { id: newId(), name: '' }] }))
  const setStudent = (id: string, name: string): void =>
    setDraft(prev => ({ ...prev, students: prev.students.map(s => (s.id === id ? { ...s, name } : s)) }))
  const removeStudent = (id: string): void =>
    setDraft(prev => ({ ...prev, students: prev.students.filter(s => s.id !== id) }))

  const addSession = (): void =>
    setDraft(prev => ({ ...prev, sessions: [...prev.sessions, { id: newId(), dateTime: '' }] }))
  const setSession = (id: string, dateTime: string): void =>
    setDraft(prev => ({ ...prev, sessions: prev.sessions.map(s => (s.id === id ? { ...s, dateTime } : s)) }))
  const removeSession = (id: string): void =>
    setDraft(prev => ({ ...prev, sessions: prev.sessions.filter(s => s.id !== id) }))

  // Khi chọn giờ mà chưa có ngày, mặc định dùng ngày hôm nay để giờ không bị mất.
  const selectHour = (id: string, newHour: string, currentDate: string): void => {
    const effectiveDate = currentDate || new Date().toISOString().slice(0, 10)
    setSession(id, combineDateTime(effectiveDate, newHour))
  }

  const save = async (): Promise<void> => {
    try {
      await window.api.saveClass(draft)
      setError(null)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <button onClick={onDone}>← Quay lại</button>
      <h2>Soạn lớp</h2>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="cls-code">Mã lớp</label><br />
        <input id="cls-code" value={draft.code} onChange={e => setCode(e.target.value)} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label htmlFor="cls-name">Tên lớp</label><br />
        <input id="cls-name" value={draft.name} onChange={e => setName(e.target.value)} style={{ width: 360 }} />
      </div>

      <h3>Học sinh</h3>
      {draft.students.map(s => (
        <div key={s.id} style={{ marginBottom: 6 }}>
          <input
            placeholder="Tên học sinh"
            value={s.name}
            onChange={e => setStudent(s.id, e.target.value)}
          />{' '}
          <button aria-label={`Xóa học sinh ${s.name}`} onClick={() => removeStudent(s.id)}>×</button>
        </div>
      ))}
      <button onClick={addStudent}>+ Thêm học sinh</button>

      <h3 style={{ marginTop: 20 }}>Buổi học</h3>
      {draft.sessions.map(s => {
        const { date, hour } = splitDateTime(s.dateTime)
        return (
          <div key={s.id} style={{ marginBottom: 6 }}>
            <input
              type="date"
              aria-label="Ngày buổi"
              value={date}
              onChange={e => setSession(s.id, combineDateTime(e.target.value, hour))}
            />{' '}
            <select
              aria-label="Giờ buổi"
              value={hour}
              onChange={e => selectHour(s.id, e.target.value, date)}
            >
              <option value="">-- giờ --</option>
              {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(h => (
                <option key={h} value={h}>{h}h</option>
              ))}
            </select>{' '}
            <button aria-label={`Xóa buổi ${s.dateTime || s.id}`} onClick={() => removeSession(s.id)}>×</button>
          </div>
        )
      })}
      <button onClick={addSession}>+ Thêm buổi</button>

      <div style={{ marginTop: 24 }}>
        <button onClick={save}>Lưu</button>
        {error && <span style={{ marginLeft: 12, color: 'crimson' }}>Lưu thất bại: {error}</span>}
      </div>
    </div>
  )
}
