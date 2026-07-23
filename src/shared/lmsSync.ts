import { SchoolClass, ClassSession, Student, SessionContent, LmsContentTarget, LmsContentResult } from './types'
import { getClassStatus } from './classStatus'

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

    const latest = past[0]
    if (!latest || hasContent(latest.id)) continue

    targets.push({
      classCode: cls.code,
      sessionId: latest.id,
      sessionDate: latest.dateTime.slice(0, 10),
    })
  }

  return targets
}

export function matchStudentByName(students: Student[], name: string): Student | undefined {
  const target = name.trim().toLowerCase()
  return students.find(
    s => target.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(target),
  )
}

export function excludeAbsentSkipped(skipped: string[], absentNames: string[]): string[] {
  return skipped.filter(skippedName => {
    const normalizedSkipped = skippedName.trim().toLowerCase()
    const technicalSkip = normalizedSkipped.match(/^(.*?)\s+\(lỗi:/)
    const skippedStudentName = technicalSkip?.[1] ?? normalizedSkipped
    return !absentNames.some(absentName => {
      const normalizedAbsent = absentName.trim().toLowerCase()
      if (normalizedAbsent === '') return false
      if (technicalSkip) return skippedStudentName === normalizedAbsent
      return ` ${skippedStudentName} `.includes(` ${normalizedAbsent} `)
    })
  })
}

export function mergeContentResult(
  cls: SchoolClass,
  session: ClassSession,
  result: LmsContentResult,
): SessionContent {
  const comments: SessionContent['comments'] = []
  const absentStudentIds: string[] = []

  for (const s of result.students) {
    const student = matchStudentByName(cls.students, s.name)
    if (!student) continue
    if (s.attended) {
      comments.push({ studentId: student.id, raw: s.comment, polished: s.comment })
    } else {
      absentStudentIds.push(student.id)
    }
  }

  return {
    id: session.id,
    classId: cls.id,
    sessionId: session.id,
    lessonContent: result.lessonContent,
    homework: result.homework,
    comments,
    absentStudentIds,
  }
}
