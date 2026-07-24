import { useEffect, useRef, useState } from 'react'
import {
  SchoolClass, ClassSession, SessionContent, StudentComment, AppConfig,
  LmsPostResult,
} from '../../../shared/types'
import { formatSessionDate } from '../../../shared/zaloTemplate'
import { buildZaloMessage } from '../../../shared/autoSend'
import { getSessionNumber, isLmsBlockedSession } from '../../../shared/sessionContent'
import { excludeAbsentSkipped } from '../../../shared/lmsSync'
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

function reconcileContentWithRoster(
  cls: SchoolClass,
  existing: SessionContent,
): SessionContent {
  return {
    ...existing,
    comments: cls.students.map(
      student => existing.comments.find(comment => comment.studentId === student.id)
        ?? { studentId: student.id, raw: '', polished: '' },
    ),
  }
}

function mergeServerMetadata(
  draft: SessionContent,
  stored: SessionContent | null,
): SessionContent {
  if (!stored) return draft
  const merged = { ...draft }
  const metadataKeys = [
    'absentStudentIds',
    'postedToLms',
    'zaloSentAt',
  ] as const
  for (const key of metadataKeys) {
    if (stored[key] === undefined) delete merged[key]
    else Object.assign(merged, { [key]: stored[key] })
  }
  return merged
}

type ComposerOperation = 'save' | 'lms' | 'zalo' | 'ai' | 'pdf' | 'preview'

export default function SessionComposer(
  { cls, session, onDone }: { cls: SchoolClass; session: ClassSession; onDone: () => void },
): JSX.Element {
  const [content, setContent] = useState<SessionContent>(() => emptyContent(cls, session))
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [rewritingAll, setRewritingAll] = useState(false)
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [contentLoading, setContentLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lmsPosting, setLmsPosting] = useState(false)
  const [zaloPosting, setZaloPosting] = useState(false)
  const [zaloStatus, setZaloStatus] = useState<{
    message: string
    success: boolean
  } | null>(null)
  const [previewRefreshing, setPreviewRefreshing] = useState(false)
  const [lmsStatus, setLmsStatus] = useState<string>('')
  const [lmsResult, setLmsResult] = useState<LmsPostResult | null>(null)
  const contentLoadingRef = useRef(true)
  const configLoadingRef = useRef(true)
  const operationRef = useRef<ComposerOperation | null>(null)

  const sessionNum = getSessionNumber(cls.sessions, session.id)
  const lmsBlocked = isLmsBlockedSession(cls.sessions, session.id)

  useEffect(() => {
    let active = true
    contentLoadingRef.current = true
    configLoadingRef.current = true
    setContentLoading(true)
    setConfigLoading(true)
    setConfig(null)
    setConfigError(null)
    void window.api.getConfig().then(loadedConfig => {
      if (active) setConfig(loadedConfig)
    }).catch(err => {
      if (active) setConfigError((err as Error).message)
    }).finally(() => {
      if (!active) return
      configLoadingRef.current = false
      setConfigLoading(false)
    })
    void window.api.getContent(session.id).then(existing => {
      if (!active || !existing) return
      setContent(reconcileContentWithRoster(cls, existing))
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
    if (contentLoadingRef.current || operationRef.current) return
    setContent(updater)
    setSaved(false)
  }

  const beginOperation = (operation: ComposerOperation): boolean => {
    if (contentLoadingRef.current || operationRef.current) return false
    operationRef.current = operation
    if (operation === 'save') setSaving(true)
    if (operation === 'lms') setLmsPosting(true)
    if (operation === 'zalo') setZaloPosting(true)
    if (operation === 'ai') setRewritingAll(true)
    if (operation === 'pdf') setExtractingPdf(true)
    if (operation === 'preview') setPreviewRefreshing(true)
    return true
  }

  const endOperation = (operation: ComposerOperation): void => {
    if (operationRef.current === operation) operationRef.current = null
    if (operation === 'save') setSaving(false)
    if (operation === 'lms') setLmsPosting(false)
    if (operation === 'zalo') setZaloPosting(false)
    if (operation === 'ai') setRewritingAll(false)
    if (operation === 'pdf') setExtractingPdf(false)
    if (operation === 'preview') setPreviewRefreshing(false)
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
    if (!beginOperation('pdf')) return
    try {
      const text = await window.api.extractLessonFromPdf()
      setContent(prev => ({ ...prev, lessonContent: text }))
      setSaved(false)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endOperation('pdf')
    }
  }

  // Sửa nhận xét cho TẤT CẢ học sinh (có mặt + có nội dung thô) trong 1 request Gemini.
  const aiRewriteAll = async (): Promise<void> => {
    if (!beginOperation('ai')) return
    try {
      const targets = cls.students.filter(s => !s.droppedOut && !isAbsent(s.id) && commentFor(s.id).raw.trim() !== '')
      if (targets.length === 0) return
      const polishedList = await window.api.rewriteCommentsBatch(
        targets.map(s => ({ name: s.name, raw: commentFor(s.id).raw })),
        content.lessonContent,
      )
      setContent(prev => ({
        ...prev,
        comments: prev.comments.map(c => {
          const idx = targets.findIndex(t => t.id === c.studentId)
          return idx >= 0 && polishedList[idx] ? { ...c, polished: polishedList[idx] } : c
        }),
      }))
      setSaved(false)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endOperation('ai')
    }
  }

  const undoAllAi = (): void =>
    mutate(prev => ({ ...prev, comments: prev.comments.map(c => ({ ...c, polished: '' })) }))

  const anyPolished = content.comments.some(c => c.polished)

  const postToLms = async (): Promise<void> => {
    if (
      lmsBlocked
      || contentLoadingRef.current
      || operationRef.current
    ) return
    if (!beginOperation('lms')) return
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
        .filter(s => !s.droppedOut && !isAbsent(s.id))
        .map(s => {
          const cm = commentFor(s.id)
          return { studentName: s.name, text: cm.polished || cm.raw }
        })
        .filter(c => c.text.trim() !== '')

      const { postResult: result, content: persisted } =
        await window.api.lmsPostSessionAndSave({
          params: {
            classCode: cls.code,
            sessionDate,
            lessonContent: content.lessonContent,
            homework: content.homework,
            comments,
          },
          content,
          students: cls.students,
        })
      setLmsResult(result)

      const reconciled = reconcileContentWithRoster(cls, persisted)
      setContent(reconciled)
      setPreview(current => (
        current === null || !config
          ? null
          : buildZaloMessage(cls, session, reconciled, config.zaloMessageTemplate)
      ))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endOperation('lms')
      setLmsStatus('')
    }
  }

  const refreshServerMetadata = async (): Promise<SessionContent> => {
    const stored = await window.api.getContent(session.id)
    const merged = mergeServerMetadata(content, stored)
    setContent(merged)
    return merged
  }

  const showPreview = async (): Promise<void> => {
    if (
      contentLoadingRef.current
      || configLoadingRef.current
      || operationRef.current
      || !config
      || !beginOperation('preview')
    ) return
    try {
      const latest = await refreshServerMetadata()
      setPreview(buildZaloMessage(cls, session, latest, config.zaloMessageTemplate))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endOperation('preview')
    }
  }

  const copyPreview = async (): Promise<void> => {
    if (
      contentLoadingRef.current
      || configLoadingRef.current
      || operationRef.current
      || !config
      || !beginOperation('preview')
    ) return
    try {
      const latest = await refreshServerMetadata()
      const text = buildZaloMessage(cls, session, latest, config.zaloMessageTemplate)
      setPreview(text)
      await navigator.clipboard.writeText(text)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endOperation('preview')
    }
  }

  const sendToZalo = async (): Promise<void> => {
    if (contentLoadingRef.current || operationRef.current || !beginOperation('zalo')) return
    try {
      const result = await window.api.zaloSendSession({
        classId: cls.id,
        sessionId: session.id,
      })
      const reconciled = reconcileContentWithRoster(cls, result.content)
      setContent(reconciled)
      if (config) {
        setPreview(buildZaloMessage(cls, session, reconciled, config.zaloMessageTemplate))
      }
      setZaloStatus({
        message: result.message,
        success: result.status === 'sent' || result.status === 'already-sent',
      })
      setError(null)
    } catch (err) {
      setZaloStatus(null)
      setError((err as Error).message)
    } finally {
      endOperation('zalo')
    }
  }

  const save = async (): Promise<void> => {
    if (!beginOperation('save')) return
    try {
      await window.api.saveContent(content)
      const persisted = await window.api.getContent(session.id)
      if (persisted) setContent(reconcileContentWithRoster(cls, persisted))
      setSaved(true)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      endOperation('save')
    }
  }

  const operationBusy =
    saving || lmsPosting || zaloPosting || rewritingAll || extractingPdf || previewRefreshing
  const contentLocked = contentLoading || operationBusy
  const previewLocked = contentLocked || configLoading || !config
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
      {configError && <p className="alert alert-error" role="alert">{configError}</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {zaloStatus && (
        <p
          className={`alert ${zaloStatus.success ? 'alert-success' : 'alert-info'}`}
          role="status"
        >
          {zaloStatus.message}
        </p>
      )}

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
        <button className="btn btn-sm" onClick={loadPdf} disabled={contentLocked}>
          {extractingPdf ? 'Đang trích PDF...' : 'Nạp PDF & trích'}
        </button>
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
          {cls.students.filter(s => !s.droppedOut).map(s => {
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
        <button className="btn" onClick={() => void showPreview()} disabled={previewLocked}>
          Xem trước Zalo
        </button>
        <button className="btn btn-primary" onClick={save} disabled={contentLocked}>Lưu</button>
        {saved && <span className="text-success">Đã lưu ✓</span>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={postToLms} disabled={contentLocked || lmsBlocked}>
          {lmsPosting ? lmsStatus || 'Đang xử lý...' : 'Gửi lên LMS'}
        </button>
      </div>

      {lmsBlocked && (
        <p className="alert alert-info">
          Buổi #{sessionNum} có cơ chế đặc biệt — tạm khóa gửi lên LMS (sẽ bổ sung ở phase sau). Bạn vẫn soạn/lưu và xem trước Zalo bình thường.
        </p>
      )}

      {lmsResult && (
        <div
          className="card card-pad"
          role="status"
          aria-live="polite"
          style={{ fontSize: 13, marginBottom: 16 }}
        >
          {lmsResult.error && <p className="text-danger" role="alert" style={{ margin: 0 }}>{lmsResult.error}</p>}
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
            <div className="btn-row">
              <button
                className="btn btn-sm"
                onClick={() => void copyPreview()}
                disabled={contentLocked}
              >
                Copy tin nhắn
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => void sendToZalo()}
                disabled={contentLocked}
              >
                {zaloPosting ? 'Đang gửi Zalo...' : 'Gửi Zalo'}
              </button>
            </div>
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
