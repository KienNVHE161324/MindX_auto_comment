import { SchoolClass, ClassSession, Student, SessionContent, LmsContentTarget, LmsContentResult } from './types'
import { getClassStatus } from './classStatus'

export function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')
}

export function resolveUniqueNameMatch<T>(
  items: T[],
  targetName: string,
  getName: (item: T) => string,
): T | undefined {
  const target = normalizeStudentName(targetName)
  if (!target) return undefined

  const exact = items.filter(item => normalizeStudentName(getName(item)) === target)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return undefined

  const partial = items.filter(item => {
    const candidate = normalizeStudentName(getName(item))
    return candidate !== '' && (
      target.includes(candidate) || candidate.includes(target)
    )
  })
  return partial.length === 1 ? partial[0] : undefined
}

export function computeContentTargets(
  classes: SchoolClass[],
  hasContent: (sessionId: string) => boolean,
  now: Date = new Date(),
): LmsContentTarget[] {
  const targets: LmsContentTarget[] = []

  for (const cls of classes) {
    if (getClassStatus(cls.sessions, now) === 'đã kết thúc') continue

    const past = cls.sessions
      .filter(s => new Date(s.dateTime) < now)
      .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

    // Lấy buổi gần nhất đã qua của MỌI lớp đang diễn ra — kể cả buổi đã có nội dung,
    // để cập nhật điểm danh + phát hiện nghỉ dài hạn (hasContent chỉ còn tham khảo).
    const latest = past[0]
    if (!latest) continue
    void hasContent

    targets.push({
      classCode: cls.code,
      sessionId: latest.id,
      sessionDate: latest.dateTime.slice(0, 10),
    })
  }

  return targets
}

export function matchStudentByName(students: Student[], name: string): Student | undefined {
  return resolveUniqueNameMatch(students, name, student => student.name)
}

export function mergeAbsentStudentNames(
  students: Student[],
  existingIds: string[],
  absentStudentNames: string[],
): string[] {
  const ids = new Set(existingIds)
  for (const name of absentStudentNames) {
    const student = matchStudentByName(students, name)
    if (student) ids.add(student.id)
  }
  return [...ids]
}

export function excludeAbsentSkipped(skipped: string[], absentNames: string[]): string[] {
  const candidates = skipped.map((text, index) => {
    const technical = text.match(/^(.*?)\s+\(lỗi:/i)
    return {
      index,
      text,
      name: (technical?.[1] ?? text).trim(),
      technical: Boolean(technical),
    }
  })
  const nonTechnical = candidates.filter(candidate => !candidate.technical)
  const excludedIndexes = new Set<number>()

  for (const absentName of absentNames) {
    const match = resolveUniqueNameMatch(
      nonTechnical,
      absentName,
      candidate => candidate.name,
    )
    if (match) excludedIndexes.add(match.index)
  }

  return candidates
    .filter(candidate => !excludedIndexes.has(candidate.index))
    .map(candidate => candidate.text)
}

/**
 * Gộp kết quả LMS vào nội dung buổi.
 * - Không có `existing` (buổi chưa có trong app): lấy toàn bộ từ LMS.
 * - Có `existing` với nội dung đã soạn: GIỮ nội dung bài học + nhận xét của app,
 *   chỉ cập nhật điểm danh (`attendedStudentIds`/`absentStudentIds`) từ LMS.
 */
export function mergeContentResult(
  cls: SchoolClass,
  session: ClassSession,
  result: LmsContentResult,
  existing?: SessionContent,
): SessionContent {
  const lmsComments: SessionContent['comments'] = []
  const absentStudentIds: string[] = []
  const attendedStudentIds: string[] = []

  for (const s of result.students) {
    const student = matchStudentByName(cls.students, s.name)
    if (!student) continue
    if (s.attended) {
      attendedStudentIds.push(student.id)
      lmsComments.push({ studentId: student.id, raw: s.comment, polished: s.comment })
    } else {
      absentStudentIds.push(student.id)
    }
  }

  const hasAppContent = Boolean(
    existing && (existing.lessonContent.trim() !== '' || existing.comments.length > 0),
  )

  return {
    id: session.id,
    classId: cls.id,
    sessionId: session.id,
    lessonContent: hasAppContent ? existing!.lessonContent : result.lessonContent,
    homework: hasAppContent ? existing!.homework : result.homework,
    comments: hasAppContent ? existing!.comments : lmsComments,
    absentStudentIds,
    attendedStudentIds,
    ...(existing?.lmsPostedStudentIds ? { lmsPostedStudentIds: existing.lmsPostedStudentIds } : {}),
    ...(existing?.postedToLms ? { postedToLms: existing.postedToLms } : {}),
    ...(existing?.zaloSentAt ? { zaloSentAt: existing.zaloSentAt } : {}),
  }
}

/**
 * Đối chiếu roster app với danh sách tên trên LMS.
 * HS không khớp tên LMS nào → nghỉ dài hạn (droppedOut:true); khớp → false.
 */
export function detectDroppedOut(
  students: Student[],
  lmsNames: string[],
): { id: string; droppedOut: boolean }[] {
  const lmsNameSet = new Set(lmsNames.map(normalizeStudentName))
  return students.map(student => ({
    id: student.id,
    droppedOut: !lmsNameSet.has(normalizeStudentName(student.name)),
  }))
}
