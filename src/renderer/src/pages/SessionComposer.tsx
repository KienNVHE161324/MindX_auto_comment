import { useEffect, useState } from 'react'
import {
  SchoolClass, ClassSession, SessionContent, StudentComment, AppConfig, DEFAULT_CONFIG,
  LmsPostResult,
} from '../../../shared/types'
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
  const [lmsPosting, setLmsPosting] = useState(false)
  const [lmsStatus, setLmsStatus] = useState<string>('')
  const [lmsResult, setLmsResult] = useState<LmsPostResult | null>(null)

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

  const isAbsent = (studentId: string): boolean => (content.absentStudentIds ?? []).includes(studentId)

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

  const postToLms = async (): Promise<void> => {
    setLmsPosting(true)
    setLmsResult(null)
    setError(null)
    try {
      setLmsStatus('Đang kết nối LMS...')
      const { loggedIn } = await window.api.lmsOpenBrowser()
      if (!loggedIn) {
        setError('Hết thời gian chờ đăng nhập LMS (3 phút). Thử lại sau khi đăng nhập.')
        return
      }
      setLmsStatus('Đang gửi nhận xét...')

      const sessionDate = session.dateTime.slice(0, 10) // 'YYYY-MM-DD'
      const comments = cls.students
        .filter(s => !isAbsent(s.id))
        .map(s => {
          const cm = commentFor(s.id)
          return { studentName: s.name, text: cm.polished || cm.raw }
        })
        .filter(c => c.text.trim() !== '')

      const result = await window.api.lmsPostSession({
        classCode: cls.code,
        sessionDate,
        lessonContent: content.lessonContent,
        homework: content.homework,
        comments,
      })
      setLmsResult(result)

      if (!result.error && result.posted.length > 0) {
        const posted = { ...content, postedToLms: true }
        await window.api.saveContent(posted)
        setContent(posted)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLmsPosting(false)
      setLmsStatus('')
    }
  }

  const showPreview = (): void => {
    const text = fillTemplate(config.zaloMessageTemplate, {
      ten_lop: cls.name || cls.code,
      ngay_buoi_hoc: formatSessionDate(session.dateTime),
      noi_dung_bai_hoc: content.lessonContent,
      danh_sach_nhan_xet: formatCommentLines(
        cls.students
          .filter(s => !isAbsent(s.id))
          .map(s => ({ name: s.name, text: commentFor(s.id).polished || commentFor(s.id).raw })),
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
    <div className="page">
      <button className="btn btn-ghost btn-sm" onClick={onDone} style={{ marginBottom: 12 }}>← Quay lại</button>
      <h1 style={{ marginBottom: 4 }}>Soạn nội dung</h1>
      <div className="text-muted" style={{ marginBottom: 20 }}>
        {cls.code} · {formatSessionDate(session.dateTime) || 'buổi học'}
      </div>
      {error && <p className="alert alert-error">{error}</p>}

      <section className="section">
        <h3>Nội dung bài học</h3>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="lesson" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Nội dung bài học</label>
          <textarea
            id="lesson"
            className="textarea"
            rows={6}
            value={content.lessonContent}
            onChange={e => mutate(prev => ({ ...prev, lessonContent: e.target.value }))}
          />
        </div>
        <button className="btn btn-sm" onClick={loadPdf}>Nạp PDF &amp; trích</button>
      </section>

      <section className="section">
        <h3>Nhận xét học sinh</h3>
        {cls.students.length === 0 && <p className="text-muted">Lớp chưa có học sinh.</p>}
        <div className="stack" style={{ gap: 14 }}>
          {cls.students.map(s => {
            const cm = commentFor(s.id)
            const isRewriting = rewritingIds.has(s.id)
            const absent = isAbsent(s.id)
            return (
              <div key={s.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong>
                    {s.name}
                    {absent && <span className="badge" style={{ background: '#f2f4f7', color: '#667085', marginLeft: 8 }}>nghỉ</span>}
                  </strong>
                  {cm.polished && <span className="text-muted" style={{ fontSize: 12 }}>(AI đã sửa)</span>}
                </div>
                <textarea
                  className="textarea"
                  aria-label={`Nhận xét ${s.name}`}
                  rows={2}
                  value={cm.polished || cm.raw}
                  onChange={e => {
                    if (cm.polished) {
                      setComment(s.id, { polished: e.target.value })
                    } else {
                      setComment(s.id, { raw: e.target.value })
                    }
                  }}
                />
                <div className="btn-row" style={{ marginTop: 6 }}>
                  <button
                    className="btn btn-sm"
                    aria-label={`AI sửa ${s.name}`}
                    disabled={isRewriting}
                    onClick={() => aiRewrite(s.id, s.name)}
                  >
                    {isRewriting ? 'Đang sửa...' : 'Sửa bằng AI'}
                  </button>
                  {cm.polished && (
                    <button
                      className="btn btn-sm btn-ghost"
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
        </div>
      </section>

      <section className="section">
        <h3>Bài tập về nhà</h3>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="homework" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Bài tập về nhà</label>
          <textarea
            id="homework"
            className="textarea"
            rows={3}
            value={content.homework}
            onChange={e => mutate(prev => ({ ...prev, homework: e.target.value }))}
          />
        </div>
      </section>

      <div className="btn-row" style={{ marginBottom: 16 }}>
        <button className="btn" onClick={showPreview}>Xem trước</button>
        <button className="btn btn-primary" onClick={save}>Lưu</button>
        {saved && <span className="text-success">Đã lưu ✓</span>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={postToLms} disabled={lmsPosting}>
          {lmsPosting ? lmsStatus || 'Đang xử lý...' : 'Gửi lên LMS'}
        </button>
      </div>

      {lmsResult && (
        <div className="card card-pad" style={{ fontSize: 13, marginBottom: 16 }}>
          {lmsResult.error && <p className="text-danger" style={{ margin: 0 }}>{lmsResult.error}</p>}
          {lmsResult.posted.length > 0 && (
            <p className="text-success" style={{ margin: 0 }}>Đã nhận xét: {lmsResult.posted.join(', ')}</p>
          )}
          {lmsResult.skipped.length > 0 && (
            <p className="text-muted" style={{ margin: '4px 0 0' }}>Bỏ qua (nghỉ/thiếu nội dung): {lmsResult.skipped.join(', ')}</p>
          )}
        </div>
      )}

      {preview !== null && (
        <section className="section">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Xem trước tin nhắn Zalo</h3>
            <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(preview)}>Copy tin nhắn</button>
          </div>
          <pre
            aria-label="Xem trước Zalo"
            className="mono"
            style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 14, borderRadius: 'var(--radius-sm)', margin: 0 }}
          >
            {preview}
          </pre>
        </section>
      )}
    </div>
  )
}
