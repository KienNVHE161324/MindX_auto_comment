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
