import { useState } from 'react'
import { SchoolClass } from '../../../shared/types'
import { newId } from '../../../shared/id'
import { ArrowLeftIcon } from '../components/Icons'

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
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm back-btn" onClick={onDone}><ArrowLeftIcon /> Quay lại</button>
        <h1>Soạn lớp</h1>
      </div>

      <div className="section">
        <div className="field">
          <label htmlFor="cls-code">Mã lớp</label>
          <input id="cls-code" className="input input-auto" style={{ minWidth: 220 }} value={draft.code} onChange={e => setCode(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="cls-name">Tên lớp</label>
          <input id="cls-name" className="input" style={{ maxWidth: 420 }} value={draft.name} onChange={e => setName(e.target.value)} />
        </div>
      </div>

      <div className="section">
        <h3>Học sinh</h3>
        <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
          {draft.students.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                style={{ maxWidth: 320 }}
                placeholder="Tên học sinh"
                value={s.name}
                onChange={e => setStudent(s.id, e.target.value)}
              />
              <button className="btn btn-icon" aria-label={`Xóa học sinh ${s.name}`} onClick={() => removeStudent(s.id)}>✕</button>
            </div>
          ))}
        </div>
        <button className="btn btn-sm" onClick={addStudent}>+ Thêm học sinh</button>
      </div>

      <div className="section">
        <h3>Buổi học</h3>
        <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
          {draft.sessions.map(s => {
            const { date, hour } = splitDateTime(s.dateTime)
            return (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date"
                  className="input input-auto"
                  aria-label="Ngày buổi"
                  value={date}
                  onChange={e => setSession(s.id, combineDateTime(e.target.value, hour))}
                />
                <select
                  className="input input-auto"
                  aria-label="Giờ buổi"
                  value={hour}
                  onChange={e => selectHour(s.id, e.target.value, date)}
                >
                  <option value="">-- giờ --</option>
                  {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
                <button className="btn btn-icon" aria-label={`Xóa buổi ${s.dateTime || s.id}`} onClick={() => removeSession(s.id)}>✕</button>
              </div>
            )
          })}
        </div>
        <button className="btn btn-sm" onClick={addSession}>+ Thêm buổi</button>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={save}>Lưu</button>
        {error && <span className="text-danger">Lưu thất bại: {error}</span>}
      </div>
    </div>
  )
}
