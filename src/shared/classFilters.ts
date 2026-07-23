import { ClassStatus, getClassStatus } from './classStatus'
import { SchoolClass } from './types'

export type ClassProgram = 'robotics' | 'game' | 'web' | 'scratch' | 'other'
export type NamedClassProgram = Exclude<ClassProgram, 'other'>

export interface ClassListFilters {
  statuses: ReadonlySet<ClassStatus>
  programs: ReadonlySet<NamedClassProgram>
}

export const ALL_CLASS_PROGRAMS: readonly NamedClassProgram[] = [
  'robotics',
  'game',
  'web',
  'scratch',
]

export const DEFAULT_CLASS_FILTERS: ClassListFilters = {
  statuses: new Set<ClassStatus>(['đang diễn ra']),
  programs: new Set<NamedClassProgram>(ALL_CLASS_PROGRAMS),
}

const PROGRAM_BY_MARKER: Record<string, NamedClassProgram | undefined> = {
  R: 'robotics',
  G: 'game',
  J: 'web',
  S: 'scratch',
}

export function getClassProgram(code: string): ClassProgram {
  const separator = code.indexOf('-')
  if (separator < 0) return 'other'
  const marker = code.charAt(separator + 1).toUpperCase()
  return PROGRAM_BY_MARKER[marker] ?? 'other'
}

export function filterClasses(
  classes: SchoolClass[],
  filters: ClassListFilters,
  now: Date = new Date(),
): SchoolClass[] {
  if (filters.statuses.size === 0 || filters.programs.size === 0) return []
  const allProgramsSelected = ALL_CLASS_PROGRAMS.every(program =>
    filters.programs.has(program),
  )

  return classes.filter(cls => {
    if (!filters.statuses.has(getClassStatus(cls.sessions, now))) return false
    const program = getClassProgram(cls.code)
    return program === 'other'
      ? allProgramsSelected
      : filters.programs.has(program)
  })
}
