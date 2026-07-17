import { useEffect, useState } from 'react'
import { SchoolClass } from '../../../shared/types'
import { newId } from '../../../shared/id'
import ClassEditor from './ClassEditor'

function emptyClass(): SchoolClass {
  return { id: newId(), code: '', name: '', students: [], sessions: [] }
}

export default function ClassesPage(): JSX.Element {
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SchoolClass | null>(null)

  const reload = async (): Promise<void> => {
    try {
      setClasses(await window.api.listClasses())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    if (!editing) void reload()
  }, [editing])

  const remove = async (id: string): Promise<void> => {
    try {
      await window.api.deleteClass(id)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (editing) {
    return <ClassEditor cls={editing} onDone={() => setEditing(null)} />
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Lớp học</h1>
        <button onClick={() => setEditing(emptyClass())}>+ Thêm lớp</button>
      </div>

      {error && (
        <p style={{ color: 'crimson' }}>
          Không tải được danh sách lớp: {error}. Hãy chọn thư mục lưu dữ liệu trong tab Cấu hình.
        </p>
      )}

      {!error && classes.length === 0 && <p>Chưa có lớp nào.</p>}

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
          </li>
        ))}
      </ul>
    </div>
  )
}
