# Class List Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter class cards by lifecycle status and the `R/G/J/S` program marker in each class code, defaulting to running classes only.

**Architecture:** Put code classification and filtering in a pure shared module. `ClassesPage` owns ephemeral checkbox state, derives `visibleClasses`, and renders only those cards without changing repository, IPC, scheduler, or class mutations.

**Tech Stack:** Electron 31, React 18, TypeScript 5.9, Vitest 2, Testing Library.

## Global Constraints

- Initial status selection is exactly `đang diễn ra`.
- Initial program selection includes `robotics`, `game`, `web`, and `scratch`.
- Program is the first character immediately after the first `-`, case-insensitive.
- Unknown or malformed codes classify as `other`.
- `other` is visible only while all four named programs are selected.
- Status and program filters combine with AND.
- Empty status or program selection returns no classes.
- Filter state is not persisted.
- Existing load, sync, edit, delete, LMS, Zalo, and scheduler behavior remains unchanged.

---

## File Structure

- Create `src/shared/classFilters.ts`: filter types, constants, code classification, and pure class filtering.
- Create `src/shared/classFilters.test.ts`: parser, default, AND, `other`, and empty-selection tests.
- Modify `src/renderer/src/pages/ClassesPage.tsx`: checkbox state, filter bar, result count, empty-result copy, and `visibleClasses` rendering.
- Modify `src/renderer/src/pages/ClassesPage.test.tsx`: default and interactive filter behavior plus adaptation of existing fixtures to the new default.
- Modify `src/renderer/src/styles.css`: compact responsive filter bar.

---

### Task 1: Pure class-program and filtering rules

**Files:**
- Create: `src/shared/classFilters.ts`
- Create: `src/shared/classFilters.test.ts`

**Interfaces:**
- Consumes: `SchoolClass`, `ClassStatus`, and `getClassStatus()`.
- Produces: `ClassProgram`, `ClassListFilters`, `ALL_CLASS_PROGRAMS`, `DEFAULT_CLASS_FILTERS`, `getClassProgram()`, and `filterClasses()`.

- [ ] **Step 1: Write failing parser and filter tests**

Create `src/shared/classFilters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ALL_CLASS_PROGRAMS,
  DEFAULT_CLASS_FILTERS,
  filterClasses,
  getClassProgram,
} from './classFilters'
import { SchoolClass } from './types'

const now = new Date('2026-07-23T12:00:00')

function cls(
  id: string,
  code: string,
  sessions: SchoolClass['sessions'],
): SchoolClass {
  return { id, code, name: code, students: [], sessions }
}

const runningSessions = [
  { id: 'past', dateTime: '2026-07-20T09:00:00' },
  { id: 'future', dateTime: '2026-07-27T09:00:00' },
]
const futureSessions = [{ id: 'future', dateTime: '2026-07-27T09:00:00' }]
const endedSessions = [{ id: 'past', dateTime: '2026-07-20T09:00:00' }]

describe('getClassProgram', () => {
  it.each([
    ['ABC-R01', 'robotics'],
    ['MD-g02', 'game'],
    ['C-J03', 'web'],
    ['X-s04', 'scratch'],
    ['NO-DASH', 'other'],
    ['ABC-', 'other'],
    ['', 'other'],
  ] as const)('%s -> %s', (code, expected) => {
    expect(getClassProgram(code)).toBe(expected)
  })
})

describe('filterClasses', () => {
  const classes = [
    cls('running-r', 'ABC-R01', runningSessions),
    cls('running-other', 'ABC-X01', runningSessions),
    cls('future-g', 'ABC-G01', futureSessions),
    cls('ended-j', 'ABC-J01', endedSessions),
  ]

  it('default shows running classes and keeps other while all programs are selected', () => {
    expect(filterClasses(classes, DEFAULT_CLASS_FILTERS, now).map(item => item.id))
      .toEqual(['running-r', 'running-other'])
  })

  it('combines selected statuses and programs with AND', () => {
    expect(filterClasses(classes, {
      statuses: new Set(['chưa bắt đầu', 'đã kết thúc']),
      programs: new Set(['game', 'web']),
    }, now).map(item => item.id)).toEqual(['future-g', 'ended-j'])
  })

  it('hides other as soon as programs are narrowed', () => {
    expect(filterClasses(classes, {
      statuses: new Set(['đang diễn ra']),
      programs: new Set(['robotics', 'game', 'web']),
    }, now).map(item => item.id)).toEqual(['running-r'])
  })

  it('empty status or program selection returns no classes', () => {
    expect(filterClasses(classes, {
      statuses: new Set(),
      programs: new Set(ALL_CLASS_PROGRAMS),
    }, now)).toEqual([])
    expect(filterClasses(classes, {
      statuses: new Set(['đang diễn ra']),
      programs: new Set(),
    }, now)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm.cmd test -- src/shared/classFilters.test.ts
```

Expected: FAIL because `classFilters.ts` does not exist.

- [ ] **Step 3: Implement the pure module**

Create `src/shared/classFilters.ts`:

```ts
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
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test -- src/shared/classFilters.test.ts src/shared/classStatus.test.ts
npm.cmd run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/shared/classFilters.ts src/shared/classFilters.test.ts
git commit -m "feat: add pure class list filters"
```

---

### Task 2: Filter controls and filtered class-card rendering

**Files:**
- Modify: `src/renderer/src/pages/ClassesPage.tsx`
- Modify: `src/renderer/src/pages/ClassesPage.test.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: Task 1 `filterClasses()`, `ALL_CLASS_PROGRAMS`, `ClassListFilters`, `ClassProgram`, and `DEFAULT_CLASS_FILTERS`.
- Produces: status/program checkbox bar, `Đang xem X/Y lớp`, filtered cards, and distinct empty-result copy.

- [ ] **Step 1: Add failing renderer tests for defaults and interaction**

In `ClassesPage.test.tsx`, add a fixed three-class fixture:

```ts
const filterClassesFixture: SchoolClass[] = [
  {
    id: 'running-r',
    code: 'ABC-R01',
    name: 'Robotics',
    students: [],
    sessions: [
      { id: 'r-past', dateTime: '2020-01-01T09:00:00' },
      { id: 'r-future', dateTime: '2099-01-01T09:00:00' },
    ],
  },
  {
    id: 'future-g',
    code: 'ABC-G01',
    name: 'Game',
    students: [],
    sessions: [{ id: 'g-future', dateTime: '2099-01-01T09:00:00' }],
  },
  {
    id: 'ended-j',
    code: 'ABC-J01',
    name: 'Web',
    students: [],
    sessions: [{ id: 'j-past', dateTime: '2020-01-01T09:00:00' }],
  },
]
```

Add:

```ts
it('default shows only running classes and X/Y count', async () => {
  stub({
    listClasses: vi.fn(async () => filterClassesFixture),
    getContent: vi.fn(async () => null),
  })
  render(<ClassesPage />)

  expect(await screen.findByText('ABC-R01')).toBeInTheDocument()
  expect(screen.queryByText('ABC-G01')).not.toBeInTheDocument()
  expect(screen.queryByText('ABC-J01')).not.toBeInTheDocument()
  expect(screen.getByText('Đang xem 1/3 lớp')).toBeInTheDocument()
})

it('can add future status and narrow to Game', async () => {
  stub({
    listClasses: vi.fn(async () => filterClassesFixture),
    getContent: vi.fn(async () => null),
  })
  render(<ClassesPage />)
  await screen.findByText('ABC-R01')

  fireEvent.click(screen.getByLabelText('Lọc trạng thái Chưa bắt đầu'))
  fireEvent.click(screen.getByLabelText('Lọc loại Robotics'))
  fireEvent.click(screen.getByLabelText('Lọc loại Web'))
  fireEvent.click(screen.getByLabelText('Lọc loại Scratch'))

  expect(screen.getByText('ABC-G01')).toBeInTheDocument()
  expect(screen.queryByText('ABC-R01')).not.toBeInTheDocument()
  expect(screen.getByText('Đang xem 1/3 lớp')).toBeInTheDocument()
})

it('shows the filtered empty-state separately from an empty repository', async () => {
  stub({
    listClasses: vi.fn(async () => filterClassesFixture),
    getContent: vi.fn(async () => null),
  })
  render(<ClassesPage />)
  await screen.findByText('ABC-R01')
  fireEvent.click(screen.getByLabelText('Lọc trạng thái Đang diễn ra'))
  expect(screen.getByText('Không có lớp phù hợp với bộ lọc.')).toBeInTheDocument()
  expect(screen.queryByText('Chưa có lớp nào.')).not.toBeInTheDocument()
})
```

Update existing tests whose fixtures are not running:

- tests about generic card actions should use one past and one future session;
- tests intentionally covering ended content should click `Lọc trạng thái Đã kết thúc` before querying the card;
- the repository-empty test remains unchanged.

- [ ] **Step 2: Run renderer tests and confirm RED**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx
```

Expected: FAIL because filter controls, count, and filtered empty-state do not exist.

- [ ] **Step 3: Add filter state and stable derived results**

At the top of `ClassesPage.tsx`, import:

```ts
import {
  ALL_CLASS_PROGRAMS,
  ClassListFilters,
  NamedClassProgram,
  DEFAULT_CLASS_FILTERS,
  filterClasses,
} from '../../../shared/classFilters'
```

Inside `ClassesPage`, add:

```ts
const [classFilters, setClassFilters] = useState<ClassListFilters>(() => ({
  statuses: new Set(DEFAULT_CLASS_FILTERS.statuses),
  programs: new Set(DEFAULT_CLASS_FILTERS.programs),
}))

const visibleClasses = filterClasses(classes, classFilters)

const toggleStatus = (status: ClassStatus): void => {
  setClassFilters(current => {
    const statuses = new Set(current.statuses)
    if (statuses.has(status)) statuses.delete(status)
    else statuses.add(status)
    return { ...current, statuses }
  })
}

const toggleProgram = (program: NamedClassProgram): void => {
  setClassFilters(current => {
    const programs = new Set(current.programs)
    if (programs.has(program)) programs.delete(program)
    else programs.add(program)
    return { ...current, programs }
  })
}
```

- [ ] **Step 4: Render the filter bar and switch card mapping**

Add constants outside the component:

```ts
const STATUS_FILTER_LABEL: Record<ClassStatus, string> = {
  'chưa bắt đầu': 'Chưa bắt đầu',
  'đang diễn ra': 'Đang diễn ra',
  'đã kết thúc': 'Đã kết thúc',
}

const PROGRAM_FILTER_LABEL: Record<NamedClassProgram, string> = {
  robotics: 'Robotics',
  game: 'Game',
  web: 'Web',
  scratch: 'Scratch',
}
```

Render above the empty state and class stack:

```tsx
<div className="card card-pad class-filter-bar">
  <div className="class-filter-group">
    <strong>Trạng thái</strong>
    {(Object.keys(STATUS_FILTER_LABEL) as ClassStatus[]).map(status => (
      <label className="check compact" key={status}>
        <input
          type="checkbox"
          aria-label={`Lọc trạng thái ${STATUS_FILTER_LABEL[status]}`}
          checked={classFilters.statuses.has(status)}
          onChange={() => toggleStatus(status)}
        />
        {STATUS_FILTER_LABEL[status]}
      </label>
    ))}
  </div>
  <div className="class-filter-group">
    <strong>Loại lớp</strong>
    {ALL_CLASS_PROGRAMS.map(program => (
      <label className="check compact" key={program}>
        <input
          type="checkbox"
          aria-label={`Lọc loại ${PROGRAM_FILTER_LABEL[program]}`}
          checked={classFilters.programs.has(program)}
          onChange={() => toggleProgram(program)}
        />
        {PROGRAM_FILTER_LABEL[program]}
      </label>
    ))}
  </div>
  <span className="class-filter-count">
    Đang xem {visibleClasses.length}/{classes.length} lớp
  </span>
</div>
```

Change `classes.map(c => ...)` to `visibleClasses.map(c => ...)`.

Use these mutually exclusive empty states:

```tsx
{!error && classes.length === 0 && !syncPreview && (
  <div className="card card-pad text-muted">Chưa có lớp nào.</div>
)}
{!error && classes.length > 0 && visibleClasses.length === 0 && (
  <div className="card card-pad text-muted">
    Không có lớp phù hợp với bộ lọc.
  </div>
)}
```

- [ ] **Step 5: Add compact responsive CSS**

Append to `styles.css`:

```css
.class-filter-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.class-filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.class-filter-group .check.compact {
  margin: 0;
  gap: 4px;
  white-space: nowrap;
}

.class-filter-count {
  margin-left: auto;
  color: #667085;
  font-size: 13px;
}
```

- [ ] **Step 6: Run renderer tests and typecheck**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx src/shared/classFilters.test.ts
npm.cmd run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/renderer/src/pages/ClassesPage.tsx src/renderer/src/pages/ClassesPage.test.tsx src/renderer/src/styles.css
git commit -m "feat: filter class cards by status and program"
```

---

### Task 3: Full regression and production verification

**Files:**
- Modify only a feature file if verification reveals a regression.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a verified Phase 2 build.

- [ ] **Step 1: Run the complete test suite**

```powershell
npm.cmd test
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Run TypeScript checks**

```powershell
npm.cmd run typecheck
```

Expected: both node and web TypeScript projects exit 0.

- [ ] **Step 3: Build production bundles**

```powershell
npm.cmd run build
```

Expected: Electron main, preload, and renderer bundles all build successfully.

- [ ] **Step 4: Check the scoped diff and repository state**

```powershell
git diff --check
git status --short
git log --oneline -5
```

Expected: no whitespace error; pre-existing unrelated changes remain unstaged.

- [ ] **Step 5: Commit only a regression fix if Step 1-4 changed feature files**

Stage only the exact feature files reported by `git diff --name-only`, then:

```powershell
git commit -m "fix: address class filter regression"
```

If verification changed no source file, do not create an empty commit.
