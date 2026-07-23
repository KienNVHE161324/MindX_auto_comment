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
