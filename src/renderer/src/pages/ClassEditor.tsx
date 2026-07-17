import { useState } from 'react'
import { SchoolClass } from '../../../shared/types'
import { newId } from '../../../shared/id'

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
      {draft.sessions.map(s => (
        <div key={s.id} style={{ marginBottom: 6 }}>
          <input
            type="datetime-local"
            aria-label="Thời điểm buổi"
            value={s.dateTime}
            onChange={e => setSession(s.id, e.target.value)}
          />{' '}
          <button aria-label={`Xóa buổi ${s.dateTime || s.id}`} onClick={() => removeSession(s.id)}>×</button>
        </div>
      ))}
      <button onClick={addSession}>+ Thêm buổi</button>

      <div style={{ marginTop: 24 }}>
        <button onClick={save}>Lưu</button>
        {error && <span style={{ marginLeft: 12, color: 'crimson' }}>Lưu thất bại: {error}</span>}
      </div>
    </div>
  )
}
