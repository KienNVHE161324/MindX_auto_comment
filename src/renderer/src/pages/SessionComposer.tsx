import { useEffect, useRef, useState } from 'react'
import {
  SchoolClass, ClassSession, SessionContent, StudentComment, AppConfig, DEFAULT_CONFIG,
  LmsPostResult,
} from '../../../shared/types'
import { formatSessionDate } from '../../../shared/zaloTemplate'
import { buildZaloMessage } from '../../../shared/autoSend'
import { getSessionNumber, isLmsBlockedSession } from '../../../shared/sessionContent'
import { excludeAbsentSkipped, mergeAbsentStudentNames } from '../../../shared/lmsSync'
import { ArrowLeftIcon } from '../components/Icons'

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
  const [rewritingAll, setRewritingAll] = useState(false)
  const [contentLoading, setContentLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lmsPosting, setLmsPosting] = useState(false)
  const [lmsStatus, setLmsStatus] = useState<string>('')
  const [lmsResult, setLmsResult] = useState<LmsPostResult | null>(null)
  const contentLoadingRef = useRef(true)
  const savingRef = useRef(false)
  const lmsPostingRef = useRef(false)

  const sessionNum = getSessionNumber(cls.sessions, session.id)
  const lmsBlocked = isLmsBlockedSession(cls.sessions, session.id)

  useEffect(() => {
    let active = true
    contentLoadingRef.current = true
    setContentLoading(true)
    void window.api.getConfig().then(setConfig)
    void window.api.getContent(session.id).then(existing => {
      if (!active || !existing) return
      // Đồng bộ nhận xét theo roster hiện tại: giữ nhận xét cũ của HS còn trong lớp,
      // thêm entry rỗng cho HS mới, loại nhận xét của HS đã bị xóa khỏi lớp.
      const comments = cls.students.map(
        s => existing.comments.find(c => c.studentId === s.id) ?? { studentId: s.id, raw: '', polished: '' },
      )
      setContent({ ...existing, comments })
    }).catch(err => {
      if (active) setError((err as Error).message)
    }).finally(() => {
      if (!active) return
      contentLoadingRef.current = false
      setContentLoading(false)
    })
    return () => { active = false }
  }, [session.id, cls])

  const mutate = (updater: (prev: SessionContent) => SessionContent): void => {
    if (contentLoadingRef.current || savingRef.current || lmsPostingRef.current) return
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

  // Sửa nhận xét cho TẤT CẢ học sinh (có mặt + có nội dung thô) trong 1 request Gemini.
  const aiRewriteAll = async (): Promise<void> => {
    setRewritingAll(true)
    try {
      const targets = cls.students.filter(s => !isAbsent(s.id) && commentFor(s.id).raw.trim() !== '')
      if (targets.length === 0) { setRewritingAll(false); return }
      const polishedList = await window.api.rewriteCommentsBatch(
        targets.map(s => ({ name: s.name, raw: commentFor(s.id).raw })),
      )
      mutate(prev => ({
        ...prev,
        comments: prev.comments.map(c => {
          const idx = targets.findIndex(t => t.id === c.studentId)
          return idx >= 0 && polishedList[idx] ? { ...c, polished: polishedList[idx] } : c
        }),
      }))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRewritingAll(false)
    }
  }

  const undoAllAi = (): void =>
    mutate(prev => ({ ...prev, comments: prev.comments.map(c => ({ ...c, polished: '' })) }))

  const anyPolished = content.comments.some(c => c.polished)

  const postToLms = async (): Promise<void> => {
    if (
      lmsBlocked
      || contentLoadingRef.current
      || savingRef.current
      || lmsPostingRef.current
    ) return
    lmsPostingRef.current = true
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

      const absentStudentIds = mergeAbsentStudentNames(
        cls.students,
        content.absentStudentIds ?? [],
        result.absentStudentNames,
      )
      const didPost = !result.error && result.posted.length > 0
      const absenceChanged = absentStudentIds.length !== (content.absentStudentIds ?? []).length
      if (didPost || absenceChanged) {
        const updated: SessionContent = {
          ...content,
          absentStudentIds,
          ...(didPost ? { postedToLms: true } : {}),
        }
        await window.api.saveContent(updated)
        setContent(updated)
        setPreview(current => (
          current === null
            ? null
            : buildZaloMessage(cls, session, updated, config.zaloMessageTemplate)
        ))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      lmsPostingRef.current = false
      setLmsPosting(false)
      setLmsStatus('')
    }
  }

  const showPreview = (): void => {
    if (contentLoadingRef.current || savingRef.current || lmsPostingRef.current) return
    setPreview(buildZaloMessage(cls, session, content, config.zaloMessageTemplate))
  }

  const save = async (): Promise<void> => {
    if (contentLoadingRef.current || savingRef.current || lmsPostingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await window.api.saveContent(content)
      setSaved(true)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const contentLocked = contentLoading || saving || lmsPosting
  const technicalSkipped = lmsResult
    ? excludeAbsentSkipped(lmsResult.skipped, lmsResult.absentStudentNames)
    : []

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm back-btn" onClick={onDone}><ArrowLeftIcon /> Quay lại</button>
        <h1>Soạn nội dung</h1>
        <div className="page-subtitle">
          <span className="code-chip">{cls.code}</span>
          {sessionNum > 0 && <span className="text-muted">Buổi #{sessionNum}</span>}
          <span className="text-muted">· {formatSessionDate(session.dateTime) || 'buổi học'}</span>
        </div>
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
            disabled={contentLocked}
            onChange={e => mutate(prev => ({ ...prev, lessonContent: e.target.value }))}
          />
        </div>
        <button className="btn btn-sm" onClick={loadPdf} disabled={contentLocked}>Nạp PDF &amp; trích</button>
      </section>

      <section className="section">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Nhận xét học sinh</h3>
          <div className="btn-row">
            <button className="btn btn-sm btn-primary" onClick={aiRewriteAll} disabled={contentLocked || rewritingAll || cls.students.length === 0}>
              {rewritingAll ? 'Đang sửa...' : 'Sửa tất cả bằng AI'}
            </button>
            {anyPolished && (
              <button className="btn btn-sm btn-ghost" onClick={undoAllAi} disabled={contentLocked}>Hoàn tác tất cả</button>
            )}
          </div>
        </div>
        {cls.students.length === 0 && <p className="text-muted">Lớp chưa có học sinh.</p>}
        <div className="stack" style={{ gap: 10 }}>
          {cls.students.map(s => {
            const cm = commentFor(s.id)
            const absent = isAbsent(s.id)
            return (
              <div key={s.id} className={`student-item${absent ? ' absent' : ''}`}>
                <div className="student-head">
                  <span className="student-name">
                    {s.name}
                    {absent && <span className="badge" style={{ background: '#f2f4f7', color: '#667085', marginLeft: 8 }}>nghỉ</span>}
                  </span>
                  {cm.polished && <span className="tag-ai">AI đã sửa</span>}
                </div>
                <textarea
                  className="textarea"
                  aria-label={`Nhận xét ${s.name}`}
                  rows={2}
                  placeholder={absent ? 'Học sinh nghỉ — không gửi nhận xét' : 'Nhập nhận xét…'}
                  value={cm.polished || cm.raw}
                  disabled={contentLocked}
                  onChange={e => {
                    if (cm.polished) {
                      setComment(s.id, { polished: e.target.value })
                    } else {
                      setComment(s.id, { raw: e.target.value })
                    }
                  }}
                />
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
            disabled={contentLocked}
            onChange={e => mutate(prev => ({ ...prev, homework: e.target.value }))}
          />
        </div>
      </section>

      <div className="action-bar">
        <button className="btn" onClick={showPreview} disabled={contentLocked}>Xem trước Zalo</button>
        <button className="btn btn-primary" onClick={save} disabled={contentLocked}>Lưu</button>
        {saved && <span className="text-success">Đã lưu ✓</span>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={postToLms} disabled={contentLoading || saving || lmsPosting || lmsBlocked}>
          {lmsPosting ? lmsStatus || 'Đang xử lý...' : 'Gửi lên LMS'}
        </button>
      </div>

      {lmsBlocked && (
        <p className="alert alert-info">
          Buổi #{sessionNum} có cơ chế đặc biệt — tạm khóa gửi lên LMS (sẽ bổ sung ở phase sau). Bạn vẫn soạn/lưu và xem trước Zalo bình thường.
        </p>
      )}

      {lmsResult && (
        <div className="card card-pad" style={{ fontSize: 13, marginBottom: 16 }}>
          {lmsResult.error && <p className="text-danger" style={{ margin: 0 }}>{lmsResult.error}</p>}
          {lmsResult.posted.length > 0 && (
            <p className="text-success" style={{ margin: 0 }}>Đã nhận xét: {lmsResult.posted.join(', ')}</p>
          )}
          {lmsResult.absentStudentNames.length > 0 && (
            <p className="text-muted" style={{ margin: '4px 0 0' }}>Học sinh nghỉ: {lmsResult.absentStudentNames.join(', ')}</p>
          )}
          {technicalSkipped.length > 0 && (
            <p className="text-muted" style={{ margin: '4px 0 0' }}>Bỏ qua do lỗi/thiếu nội dung: {technicalSkipped.join(', ')}</p>
          )}
        </div>
      )}

      {preview !== null && (
        <section className="section">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Xem trước tin nhắn Zalo</h3>
            <button
              className="btn btn-sm"
              onClick={() => void navigator.clipboard.writeText(preview)}
              disabled={contentLocked}
            >
              Copy tin nhắn
            </button>
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
