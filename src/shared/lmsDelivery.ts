import { LmsPostResult, Student } from './types'

export interface LmsDeliveryEvidence {
  postedStudentIds?: string[]
  absentStudentIds?: string[]
}

export interface LmsDeliveryAssessment {
  complete: boolean
  blockers: string[]
  postedStudentIds: string[]
  absentStudentIds: string[]
}

const normalizeName = (value: string): string =>
  value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi')

/**
 * Điều kiện cho phép gửi Zalo: mọi HS còn học (không nghỉ dài hạn) phải đã biết
 * trạng thái — đi học (attendedStudentIds) hoặc nghỉ buổi (absentStudentIds).
 * Lỗi kỹ thuật khi post nhận xét không ảnh hưởng vì điểm danh đọc riêng.
 */
export function assessZaloReadiness(
  students: Student[],
  content: {
    absentStudentIds?: string[]
    attendedStudentIds?: string[]
    lmsPostedStudentIds?: string[]
  },
): { ready: boolean; unknownStudentNames: string[] } {
  // HS đã post nhận xét thành công tức là đã đi học → tính là điểm danh (tương thích data cũ).
  const handled = new Set([
    ...(content.attendedStudentIds ?? []),
    ...(content.absentStudentIds ?? []),
    ...(content.lmsPostedStudentIds ?? []),
  ])
  const unknownStudentNames = students
    .filter(student => !student.droppedOut && !handled.has(student.id))
    .map(student => student.name)
  return { ready: unknownStudentNames.length === 0, unknownStudentNames }
}

export function assessLmsDelivery(
  students: Student[],
  result: LmsPostResult,
  priorEvidence: LmsDeliveryEvidence = {},
): LmsDeliveryAssessment {
  const postedStudentIds = [...new Set(priorEvidence.postedStudentIds ?? [])]
  const absentStudentIds = [...new Set(priorEvidence.absentStudentIds ?? [])]

  if (result.error) {
    return {
      complete: false,
      blockers: [`LMS: ${result.error}`],
      postedStudentIds,
      absentStudentIds,
    }
  }

  const postedNames = new Set(result.posted.map(normalizeName))
  const absentNames = new Set(result.absentStudentNames.map(normalizeName))
  for (const student of students) {
    const name = normalizeName(student.name)
    if (postedNames.has(name) && !postedStudentIds.includes(student.id)) {
      postedStudentIds.push(student.id)
    }
    if (absentNames.has(name) && !absentStudentIds.includes(student.id)) {
      absentStudentIds.push(student.id)
    }
  }

  const handled = new Set([...postedStudentIds, ...absentStudentIds])
  const blockers = students
    .filter(student => !handled.has(student.id))
    .map(student => student.name)

  return {
    complete: blockers.length === 0,
    blockers,
    postedStudentIds,
    absentStudentIds,
  }
}
