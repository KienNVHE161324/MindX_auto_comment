import { useEffect, useState } from 'react'
import { SchoolClass, ClassSession, SessionContent, StudentComment, AppConfig, DEFAULT_CONFIG } from '../../../shared/types'
import { fillTemplate, formatCommentLines, formatSessionDate } from '../../../shared/zaloTemplate'

function emptyContent(cls: SchoolClass, session: ClassSession): SessionContent {
  return {
    id: session.id,
    classId: cls.id,
    sessionId: session.id,
    lessonContent: '',
    homework: '',
    comments: cls.students.map(s => ({ studentId: s.id, raw: '', polished: '' })),
  }
}

export default function SessionComposer(
  { cls, session, onDone }: { cls: SchoolClass; session: ClassSession; onDone: () => void },
): JSX.Element {
  const [content, setContent] = useState<SessionContent>(() => emptyContent(cls, session))
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [rewritingIds, setRewritingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    void window.api.getConfig().then(setConfig)
    void window.api.getContent(session.id).then(existing => {
      if (!existing) return
      // Đồng bộ nhận xét theo roster hiện tại: giữ nhận xét cũ của HS còn trong lớp,
      // thêm entry rỗng cho HS mới, loại nhận xét của HS đã bị xóa khỏi lớp.
      const comments = cls.students.map(
        s => existing.comments.find(c => c.studentId === s.id) ?? { studentId: s.id, raw: '', polished: '' },
      )
      setContent({ ...existing, comments })
    })
  }, [session.id, cls])

  const mutate = (updater: (prev: SessionContent) => SessionContent): void => {
    setContent(updater)
    setSaved(false)
  }

  const commentFor = (studentId: string): StudentComment =>
    content.comments.find(c => c.studentId === studentId) ?? { studentId, raw: '', polished: '' }

  const setComment = (studentId: string, patch: Partial<StudentComment>): void =>
    mutate(prev => {
      const exists = prev.comments.some(c => c.studentId === studentId)
      const comments = exists
        ? prev.comments.map(c => (c.studentId === studentId ? { ...c, ...patch } : c))
        : [...prev.comments, { studentId, raw: '', polished: '', ...patch }]
      return { ...prev, comments }
    })

  const loadPdf = async (): Promise<void> => {
    try {
      const text = await window.api.extractLessonFromPdf()
      mutate(prev => ({ ...prev, lessonContent: text }))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const aiRewrite = async (studentId: string, name: string): Promise<void> => {
    setRewritingIds(prev => new Set(prev).add(studentId))
    try {
      const polished = await window.api.rewriteComment(name, commentFor(studentId).raw)
      setComment(studentId, { polished })
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRewritingIds(prev => { const next = new Set(prev); next.delete(studentId); return next })
    }
  }

  const showPreview = (): void => {
    const text = fillTemplate(config.zaloMessageTemplate, {
      ten_lop: cls.name || cls.code,
      ngay_buoi_hoc: formatSessionDate(session.dateTime),
      noi_dung_bai_hoc: content.lessonContent,
      danh_sach_nhan_xet: formatCommentLines(
        cls.students.map(s => ({ name: s.name, text: commentFor(s.id).polished || commentFor(s.id).raw })),
      ),
      bai_tap_ve_nha: content.homework,
    })
    setPreview(text)
  }

  const save = async (): Promise<void> => {
    try {
      await window.api.saveContent(content)
      setSaved(true)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 760, fontFamily: 'system-ui' }}>
      <button onClick={onDone}>← Quay lại</button>
      <h2>Soạn nội dung — {cls.code} · {formatSessionDate(session.dateTime) || 'buổi học'}</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section style={{ marginBottom: 20 }}>
        <label htmlFor="lesson">Nội dung bài học</label><br />
        <textarea
          id="lesson"
          rows={6}
          style={{ width: '100%' }}
          value={content.lessonContent}
          onChange={e => mutate(prev => ({ ...prev, lessonContent: e.target.value }))}
        />
        <div><button onClick={loadPdf}>Nạp PDF &amp; trích</button></div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3>Nhận xét học sinh</h3>
        {cls.students.length === 0 && <p>Lớp chưa có học sinh.</p>}
        {cls.students.map(s => {
          const cm = commentFor(s.id)
          const isRewriting = rewritingIds.has(s.id)
          return (
            <div key={s.id} style={{ borderBottom: '1px solid #eee', paddingBottom: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{s.name}</strong>
                {cm.polished && <span style={{ fontSize: 12, color: '#888' }}>(AI đã sửa)</span>}
              </div>
              <textarea
                aria-label={`Nhận xét ${s.name}`}
                rows={2}
                style={{ width: '100%', marginTop: 4 }}
                value={cm.polished || cm.raw}
                onChange={e => {
                  if (cm.polished) {
                    setComment(s.id, { polished: e.target.value })
                  } else {
                    setComment(s.id, { raw: e.target.value })
                  }
                }}
              />
              <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                <button
                  aria-label={`AI sửa ${s.name}`}
                  disabled={isRewriting}
                  onClick={() => aiRewrite(s.id, s.name)}
                >
                  {isRewriting ? 'Đang sửa...' : 'Sửa bằng AI'}
                </button>
                {cm.polished && (
                  <button
                    aria-label={`Hoàn tác ${s.name}`}
                    onClick={() => setComment(s.id, { polished: '' })}
                  >
                    Hoàn tác
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      <section style={{ marginBottom: 20 }}>
        <label htmlFor="homework">Bài tập về nhà</label><br />
        <textarea
          id="homework"
          rows={3}
          style={{ width: '100%' }}
          value={content.homework}
          onChange={e => mutate(prev => ({ ...prev, homework: e.target.value }))}
        />
      </section>

      <button onClick={showPreview}>Xem trước</button>{' '}
      <button onClick={save}>Lưu</button>
      {saved && <span style={{ marginLeft: 12, color: 'green' }}>Đã lưu ✓</span>}

      {preview !== null && (
        <section style={{ marginTop: 20 }}>
          <h3>Xem trước tin nhắn Zalo</h3>
          <button onClick={() => void navigator.clipboard.writeText(preview)}>Copy tin nhắn</button>
          <pre aria-label="Xem trước Zalo" style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12 }}>
            {preview}
          </pre>
        </section>
      )}
    </div>
  )
}
