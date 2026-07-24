# Per-Class Auto-Send and Catch-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent LMS/Zalo schedules to each running class and require explicit confirmation before sending schedules missed while the app was closed.

**Architecture:** Keep scheduling decisions as pure functions in `src/shared/autoSend.ts`, while `AutoSendScheduler` owns the startup catch-up snapshot, the periodic hold set, and channel side effects. Expose the frozen startup snapshot and its execution through typed IPC; render configuration and catch-up controls in `ClassesPage`.

**Tech Stack:** Electron 31, React 18, TypeScript 5.9, Vitest 2, Testing Library.

## Global Constraints

- Only classes whose computed status is `đang diễn ra` are eligible.
- Select the past session with the greatest `dateTime`; never use session number or array order.
- The due instant is the selected session's local calendar date plus the class `HH:mm`.
- `lmsEnabled` and `zaloEnabled` are independent and preserve `postedToLms` / `zaloSentAt` idempotency.
- Legacy `{ enabled: true, time }` means both channels enabled; legacy `enabled: false` means both disabled.
- A startup catch-up snapshot performs no side effect until `Gửi bù tất cả`.
- Items dismissed with `Để sau` remain held out of periodic ticks until the next app launch.
- Classes not due at startup remain eligible for their normal periodic tick later in the same app session.
- Phase 1 continues using the existing Zalo adapter; Zalo Web automation is a later phase.
- Preserve unrelated working-tree changes and commit only files listed by each task.

---

## File Structure

- `src/shared/types.ts`: new schedule, catch-up item/result, IPC, and renderer API contracts.
- `src/shared/autoSend.ts`: legacy normalization, session-relative due calculation, running-class planning.
- `src/shared/autoSend.test.ts`: pure decision and migration tests.
- `src/main/classes/ClassRepository.ts`: normalize persisted legacy schedules on reads and writes.
- `src/main/classes/ClassRepository.test.ts`: repository compatibility tests.
- `src/main/automation/AutoSendScheduler.ts`: startup snapshot, hold set, periodic execution, and catch-up execution.
- `src/main/automation/AutoSendScheduler.test.ts`: scheduler concurrency, channel, snapshot, and result tests.
- `src/main/index.ts`: construct scheduler once, initialize before periodic ticks, register catch-up IPC.
- `src/preload/index.ts`: expose typed catch-up IPC methods.
- `src/main/ipcHandlers.ts`: application handler façade for catch-up methods.
- `src/main/ipcHandlers.test.ts`: IPC façade delegation tests.
- `src/renderer/src/pages/ClassEditor.tsx`: remove the obsolete auto-send editor.
- `src/renderer/src/pages/ClassEditor.test.tsx`: assert auto-send controls no longer live here.
- `src/renderer/src/pages/ClassesPage.tsx`: inline schedule controls, autosave, startup catch-up notice, and result summary.
- `src/renderer/src/pages/ClassesPage.test.tsx`: inline-save and catch-up interaction tests.
- `src/renderer/src/styles.css`: compact class-card schedule and catch-up presentation.

---

### Task 1: Typed configuration migration and pure scheduling rules

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/autoSend.ts`
- Modify: `src/shared/autoSend.test.ts`
- Modify: `src/main/classes/ClassRepository.ts`
- Modify: `src/main/classes/ClassRepository.test.ts`

**Interfaces:**
- Produces: `AutoSendConfig { time; lmsEnabled; zaloEnabled }`.
- Produces: `normalizeAutoSend(value): AutoSendConfig`.
- Produces: `scheduledAt(session, time): Date | null`.
- Produces: `planAutoSend(cls, content, now): AutoSendPlan | null`.
- Consumes: `getClassStatus()` and existing LMS-block/session metadata rules.

- [ ] **Step 1: Write failing shared tests for migration, due time, running status, nearest session, and independent channels**

Replace legacy fixtures in `src/shared/autoSend.test.ts` and add these cases:

```ts
import {
  normalizeAutoSend,
  nearestPastSession,
  scheduledAt,
  planAutoSend,
} from './autoSend'

it('normalizes legacy enabled=true to both channels', () => {
  expect(normalizeAutoSend({ enabled: true, time: '18:30' })).toEqual({
    time: '18:30',
    lmsEnabled: true,
    zaloEnabled: true,
  })
})

it('builds due time from the selected session date, not today', () => {
  expect(scheduledAt(
    { id: 'ss1', dateTime: '2026-07-20T14:00:00' },
    '18:30',
  )?.toISOString()).toBe(new Date('2026-07-20T18:30:00').toISOString())
})

it('rejects a class that already ended', () => {
  const ended = {
    ...cls,
    sessions: [{ id: 'ss1', dateTime: '2026-07-10T14:00:00' }],
  }
  expect(planAutoSend(ended, content, new Date('2026-07-17T19:00:00'))).toBeNull()
})

it('honors LMS-only configuration', () => {
  const configured = {
    ...cls,
    autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false },
  }
  expect(planAutoSend(configured, content, now)).toMatchObject({
    needLms: true,
    needZalo: false,
  })
})
```

Keep one future session in eligible class fixtures so `getClassStatus()` returns `đang diễn ra`.

- [ ] **Step 2: Run the focused shared tests and confirm RED**

Run:

```powershell
npm.cmd test -- src/shared/autoSend.test.ts
```

Expected: FAIL because the new configuration shape and helpers do not exist.

- [ ] **Step 3: Implement the new contracts and pure helpers**

In `src/shared/types.ts`:

```ts
export interface AutoSendConfig {
  time: string
  lmsEnabled: boolean
  zaloEnabled: boolean
}

export interface LegacyAutoSendConfig {
  enabled: boolean
  time: string
}
```

In `src/shared/autoSend.ts`:

```ts
import { getClassStatus } from './classStatus'
import {
  AutoSendConfig,
  LegacyAutoSendConfig,
  SchoolClass,
  ClassSession,
  SessionContent,
} from './types'

export function normalizeAutoSend(
  value?: AutoSendConfig | LegacyAutoSendConfig,
): AutoSendConfig {
  if (!value) return { time: '18:00', lmsEnabled: false, zaloEnabled: false }
  if ('enabled' in value) {
    return {
      time: value.time,
      lmsEnabled: value.enabled,
      zaloEnabled: value.enabled,
    }
  }
  return value
}

export function scheduledAt(
  session: ClassSession,
  time: string,
): Date | null {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  const date = session.dateTime.slice(0, 10)
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const result = new Date(`${date}T${match[1]}:${match[2]}:00`)
  return Number.isNaN(result.getTime()) ? null : result
}

export function planAutoSend(
  cls: SchoolClass,
  content: SessionContent | null,
  now: Date = new Date(),
): AutoSendPlan | null {
  if (getClassStatus(cls.sessions, now) !== 'đang diễn ra') return null
  const config = normalizeAutoSend(cls.autoSend)
  if (!config.lmsEnabled && !config.zaloEnabled) return null
  const session = nearestPastSession(cls.sessions, now)
  if (!session || !content) return null
  const due = scheduledAt(session, config.time)
  if (!due || now < due) return null
  const needLms =
    config.lmsEnabled &&
    !content.postedToLms &&
    !isLmsBlockedSession(cls.sessions, session.id)
  const needZalo = config.zaloEnabled && !content.zaloSentAt
  return needLms || needZalo
    ? { session, content, needLms, needZalo }
    : null
}
```

Remove `isAutoSendDue()` because its “today” semantics are invalid for this feature.

- [ ] **Step 4: Add repository normalization tests**

Add to `src/main/classes/ClassRepository.test.ts`:

```ts
it('normalizes a legacy schedule when reading', async () => {
  await repo.save({
    ...makeClass('c1', 'A1'),
    autoSend: { enabled: true, time: '19:15' },
  } as unknown as SchoolClass)
  expect((await repo.get('c1'))?.autoSend).toEqual({
    time: '19:15',
    lmsEnabled: true,
    zaloEnabled: true,
  })
})

it('normalizes missing schedule to both channels disabled', async () => {
  expect((await repo.save(makeClass('c1', 'A1')), await repo.get('c1'))?.autoSend)
    .toEqual({ time: '18:00', lmsEnabled: false, zaloEnabled: false })
})
```

- [ ] **Step 5: Normalize repository reads and writes**

In `src/main/classes/ClassRepository.ts`:

```ts
import { normalizeAutoSend } from '../../shared/autoSend'

function normalizeClass(cls: SchoolClass): SchoolClass {
  return { ...cls, autoSend: normalizeAutoSend(cls.autoSend) }
}

async list(): Promise<SchoolClass[]> {
  return (await this.storage.list<SchoolClass>(COLLECTION)).map(normalizeClass)
}

async get(id: string): Promise<SchoolClass | null> {
  const cls = await this.storage.read<SchoolClass>(COLLECTION, id)
  return cls ? normalizeClass(cls) : null
}

save(cls: SchoolClass): Promise<void> {
  return this.storage.write(COLLECTION, cls.id, normalizeClass(cls))
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test -- src/shared/autoSend.test.ts src/main/classes/ClassRepository.test.ts
npm.cmd run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/shared/types.ts src/shared/autoSend.ts src/shared/autoSend.test.ts src/main/classes/ClassRepository.ts src/main/classes/ClassRepository.test.ts
git commit -m "feat: add per-channel class schedules"
```

---

### Task 2: Startup catch-up snapshot and scheduler execution

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/automation/AutoSendScheduler.ts`
- Modify: `src/main/automation/AutoSendScheduler.test.ts`

**Interfaces:**
- Produces: `AutoSendCatchUpItem`, `AutoSendCatchUpResult`, and `AutoSendChannel`.
- Produces: `AutoSendScheduler.initializeCatchUp(): Promise<AutoSendCatchUpItem[]>`.
- Produces: `AutoSendScheduler.getCatchUpItems(): AutoSendCatchUpItem[]`.
- Produces: `AutoSendScheduler.runCatchUp(): Promise<AutoSendCatchUpResult[]>`.
- Consumes: Task 1 `planAutoSend()` and normalized class schedules.

- [ ] **Step 1: Add failing scheduler tests for startup discovery and the hold set**

Add to `src/main/automation/AutoSendScheduler.test.ts`:

```ts
it('startup discovery freezes due items without sending', async () => {
  const deps = makeDeps({
    getClasses: vi.fn(async () => [makeRunningCls()]),
    getContent: vi.fn(async () => makeContent()),
  })
  const scheduler = new AutoSendScheduler(deps)

  const items = await scheduler.initializeCatchUp()

  expect(items).toEqual([expect.objectContaining({
    classId: 'c1',
    sessionId: 'ss1',
    channels: ['lms', 'zalo'],
  })])
  expect(deps.lmsPostSession).not.toHaveBeenCalled()
  expect(deps.writeZaloMessage).not.toHaveBeenCalled()

  await scheduler.tick()
  expect(deps.lmsPostSession).not.toHaveBeenCalled()
  expect(deps.writeZaloMessage).not.toHaveBeenCalled()
})

it('a class not due at startup still runs when it becomes due', async () => {
  let clock = new Date('2026-07-17T17:59:00')
  const deps = makeDeps({
    now: () => clock,
    getClasses: vi.fn(async () => [makeRunningCls()]),
    getContent: vi.fn(async () => makeContent()),
  })
  const scheduler = new AutoSendScheduler(deps)
  expect(await scheduler.initializeCatchUp()).toEqual([])

  clock = new Date('2026-07-17T18:01:00')
  await scheduler.tick()

  expect(deps.lmsPostSession).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts
```

Expected: FAIL because catch-up methods and types do not exist.

- [ ] **Step 3: Define typed catch-up contracts**

Add to `src/shared/types.ts`:

```ts
export type AutoSendChannel = 'lms' | 'zalo'

export interface AutoSendCatchUpItem {
  classId: string
  classCode: string
  className: string
  sessionId: string
  sessionDateTime: string
  channels: AutoSendChannel[]
}

export interface AutoSendCatchUpResult {
  classId: string
  classCode: string
  sessionId: string
  status: 'success' | 'skipped' | 'error'
  completedChannels: AutoSendChannel[]
  message: string
}
```

- [ ] **Step 4: Implement a frozen startup snapshot and periodic hold set**

In `AutoSendScheduler`, add:

```ts
private catchUpItems: AutoSendCatchUpItem[] = []
private readonly heldKeys = new Set<string>()

async initializeCatchUp(): Promise<AutoSendCatchUpItem[]> {
  const now = this.deps.now?.() ?? new Date()
  const classes = await this.deps.getClasses()
  const items: AutoSendCatchUpItem[] = []

  for (const cls of classes) {
    const session = nearestPastSession(cls.sessions, now)
    const content = session ? await this.deps.getContent(session.id) : null
    const plan = planAutoSend(cls, content, now)
    if (!plan) continue
    const channels: AutoSendChannel[] = [
      ...(plan.needLms ? ['lms' as const] : []),
      ...(plan.needZalo ? ['zalo' as const] : []),
    ]
    const item = {
      classId: cls.id,
      classCode: cls.code,
      className: cls.name,
      sessionId: plan.session.id,
      sessionDateTime: plan.session.dateTime,
      channels,
    }
    items.push(item)
    this.heldKeys.add(`${cls.id}:${plan.session.id}`)
  }

  this.catchUpItems = items
  return this.getCatchUpItems()
}

getCatchUpItems(): AutoSendCatchUpItem[] {
  return this.catchUpItems.map(item => ({
    ...item,
    channels: [...item.channels],
  }))
}
```

Change periodic `processClass()` to return before side effects when
`heldKeys.has(\`${cls.id}:${plan.session.id}\`)`.

- [ ] **Step 5: Add failing tests for explicit catch-up execution and per-class isolation**

```ts
it('runCatchUp sends the frozen item only after confirmation', async () => {
  const deps = makeDeps({
    getClasses: vi.fn(async () => [makeRunningCls()]),
    getContent: vi.fn(async () => makeContent()),
  })
  const scheduler = new AutoSendScheduler(deps)
  await scheduler.initializeCatchUp()

  const result = await scheduler.runCatchUp()

  expect(result).toEqual([expect.objectContaining({
    classCode: 'A1',
    status: 'success',
    completedChannels: ['lms', 'zalo'],
  })])
  expect(deps.lmsPostSession).toHaveBeenCalledOnce()
  expect(deps.writeZaloMessage).toHaveBeenCalledOnce()
})

it('one catch-up error does not stop the next class', async () => {
  const first = makeRunningCls({ id: 'c1', code: 'A1' })
  const second = makeRunningCls({
    id: 'c2',
    code: 'B2',
    sessions: [
      { id: 'ss2', dateTime: '2026-07-17T14:00:00' },
      { id: 'ss2-future', dateTime: '2026-07-24T14:00:00' },
    ],
  })
  let failFirstDuringRun = false
  const deps = makeDeps({
    getClasses: vi.fn(async () => [first, second]),
    getContent: vi.fn(async (sessionId: string) => {
      if (failFirstDuringRun && sessionId === 'ss1') {
        throw new Error('Không đọc được content A1')
      }
      return makeContent({
        id: sessionId,
        sessionId,
        classId: sessionId === 'ss1' ? 'c1' : 'c2',
      })
    }),
  })
  const scheduler = new AutoSendScheduler(deps)
  await scheduler.initializeCatchUp()
  failFirstDuringRun = true
  const results = await scheduler.runCatchUp()
  expect(results.map(result => result.status)).toEqual(['error', 'success'])
})
```

The helper fixtures must create running classes by including both a past selected session and a future final session.

- [ ] **Step 6: Refactor channel execution to return observable outcomes**

Introduce internal results:

```ts
interface ProcessOutcome {
  completedChannels: AutoSendChannel[]
  errorMessages: string[]
}

private async executePlan(
  cls: SchoolClass,
  plan: AutoSendPlan,
  log: (msg: string) => void,
): Promise<ProcessOutcome> {
  const completedChannels: AutoSendChannel[] = []
  const errorMessages: string[] = []
  let content = plan.content

  if (plan.needLms) {
    const result = await this.sendLms(cls, plan.session, content, log)
    content = result.content
    if (result.completed) completedChannels.push('lms')
    if (result.error) errorMessages.push(result.error)
  }
  if (plan.needZalo && !content.zaloSentAt) {
    const result = await this.sendZalo(cls, plan.session, content, log)
    content = result.content
    if (result.completed) completedChannels.push('zalo')
    if (result.error) errorMessages.push(result.error)
  }
  return { completedChannels, errorMessages }
}
```

Make `sendLms()` and `sendZalo()` return:

```ts
interface ChannelOutcome {
  content: SessionContent
  completed: boolean
  error?: string
}
```

Preserve the existing rule that an LMS metadata persistence failure stops Zalo for that class. Other LMS failures may still allow Zalo.

Implement `runCatchUp()` under the same scheduler single-flight guard used by `tick()`. For each frozen item, reload the class and content, recompute the plan, intersect it with the frozen `channels`, then produce:

```ts
{
  classId: item.classId,
  classCode: item.classCode,
  sessionId: item.sessionId,
  status: errors.length > 0
    ? 'error'
    : completedChannels.length > 0
      ? 'success'
      : 'skipped',
  completedChannels,
  message: errors.join('; ') || (
    completedChannels.length > 0
      ? 'Đã gửi các kênh đã chọn.'
      : 'Nội dung hoặc trạng thái gửi đã thay đổi.'
  ),
}
```

Clear only successfully completed or now-ineligible items from `catchUpItems`; keep failed/skipped items held for the rest of the current app session.

- [ ] **Step 7: Run scheduler tests and typecheck**

Run:

```powershell
npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts src/shared/autoSend.test.ts
npm.cmd run typecheck
```

Expected: both commands exit 0 and existing stale-content/mutex tests remain green.

- [ ] **Step 8: Commit Task 2**

```powershell
git add src/shared/types.ts src/main/automation/AutoSendScheduler.ts src/main/automation/AutoSendScheduler.test.ts
git commit -m "feat: add startup auto-send catch-up"
```

---

### Task 3: Initialize the scheduler safely and expose catch-up through IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/main/ipcHandlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `IPC.autoSendGetCatchUp` and `IPC.autoSendRunCatchUp`.
- Produces: `AppApi.getAutoSendCatchUp()` and `AppApi.runAutoSendCatchUp()`.
- Consumes: Task 2 scheduler lifecycle methods.

- [ ] **Step 1: Add failing IPC façade delegation tests**

Extend the dependency object in `src/main/ipcHandlers.test.ts` and add:

```ts
it('delegates auto-send catch-up reads and execution', async () => {
  const getAutoSendCatchUp = vi.fn(() => [catchUpItem])
  const runAutoSendCatchUp = vi.fn(async () => [catchUpResult])
  const handlers = createIpcHandlers(makeDeps({
    getAutoSendCatchUp,
    runAutoSendCatchUp,
  }))

  expect(handlers.getAutoSendCatchUp()).toEqual([catchUpItem])
  await expect(handlers.runAutoSendCatchUp()).resolves.toEqual([catchUpResult])
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm.cmd test -- src/main/ipcHandlers.test.ts
```

Expected: FAIL because the dependencies and handlers do not exist.

- [ ] **Step 3: Add IPC and preload contracts**

In `src/shared/types.ts`:

```ts
// Add these two properties before the closing `} as const` of IPC:
autoSendGetCatchUp: 'autoSend:getCatchUp',
autoSendRunCatchUp: 'autoSend:runCatchUp',

// Add these methods before the closing brace of AppApi:
getAutoSendCatchUp(): Promise<AutoSendCatchUpItem[]>
runAutoSendCatchUp(): Promise<AutoSendCatchUpResult[]>
```

In `src/preload/index.ts`:

```ts
getAutoSendCatchUp: () => ipcRenderer.invoke(IPC.autoSendGetCatchUp),
runAutoSendCatchUp: () => ipcRenderer.invoke(IPC.autoSendRunCatchUp),
```

Add these dependencies and pass-through methods to `createIpcHandlers()`:

```ts
getAutoSendCatchUp: () => AutoSendCatchUpItem[]
runAutoSendCatchUp: () => Promise<AutoSendCatchUpResult[]>

getAutoSendCatchUp: () => deps.getAutoSendCatchUp(),
runAutoSendCatchUp: () => deps.runAutoSendCatchUp(),
```

- [ ] **Step 4: Reorder main-process startup so discovery wins the race**

Refactor `src/main/index.ts` into:

```ts
function createAutoSendScheduler(): AutoSendScheduler {
  return new AutoSendScheduler({
    getClasses: async () => (await getRepository()).list(),
    getContent: async sessionId => (await getContentRepository()).get(sessionId),
    updateContentMetadata: async (sessionId, patch) =>
      (await getContentRepository()).updateMetadata(sessionId, patch),
    getConfig: () => configStore.load(),
    lmsOpenBrowser: async () => {
      const cfg = await configStore.load()
      return lmsAutomator.openBrowser(
        cfg.lmsEmail ?? undefined,
        cfg.lmsPassword ?? undefined,
      )
    },
    lmsPostSession: params => lmsAutomator.postSession(params),
    runLmsPostExclusive: operation =>
      lmsAutomator.runPostSessionExclusive(operation),
    writeZaloMessage: writeZaloMessageToDocuments(app.getPath('documents')),
    log: msg => console.log(msg),
  })
}

function startAutoSendTimer(scheduler: AutoSendScheduler): void {
  setInterval(() => { void scheduler.tick() }, AUTO_SEND_INTERVAL_MS)
}

function registerIpc(scheduler: AutoSendScheduler): void {
  // existing handlers
  ipcMain.handle(
    IPC.autoSendGetCatchUp,
    () => handlers.getAutoSendCatchUp(),
  )
  ipcMain.handle(
    IPC.autoSendRunCatchUp,
    () => handlers.runAutoSendCatchUp(),
  )
}

app.whenReady().then(async () => {
  const scheduler = createAutoSendScheduler()
  await scheduler.initializeCatchUp()
  registerIpc(scheduler)
  createWindow()
  startAutoSendTimer(scheduler)
  void scheduler.tick()
  // existing activate handler
})
```

Pass `scheduler.getCatchUpItems()` and `scheduler.runCatchUp()` into `createIpcHandlers()`. Catch and log initialization read errors, then continue with an empty snapshot so an unavailable storage folder does not prevent the window opening.

- [ ] **Step 5: Run IPC tests and typecheck**

Run:

```powershell
npm.cmd test -- src/main/ipcHandlers.test.ts src/main/automation/AutoSendScheduler.test.ts
npm.cmd run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/shared/types.ts src/main/ipcHandlers.ts src/main/ipcHandlers.test.ts src/preload/index.ts src/main/index.ts
git commit -m "feat: expose auto-send catch-up to renderer"
```

---

### Task 4: Move per-class scheduling controls onto class cards

**Files:**
- Modify: `src/renderer/src/pages/ClassesPage.tsx`
- Modify: `src/renderer/src/pages/ClassesPage.test.tsx`
- Modify: `src/renderer/src/pages/ClassEditor.tsx`
- Modify: `src/renderer/src/pages/ClassEditor.test.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: Task 1 normalized `SchoolClass.autoSend`.
- Produces: inline time/LMS/Zalo controls that call existing `window.api.saveClass()`.

- [ ] **Step 1: Add failing renderer tests for inline controls and autosave**

Add to `ClassesPage.test.tsx`:

```ts
it('autosaves LMS and Zalo independently from the class card', async () => {
  const configured = {
    ...c1,
    autoSend: { time: '18:00', lmsEnabled: false, zaloEnabled: false },
  }
  const api = stub({ listClasses: vi.fn(async () => [configured]) })
  render(<ClassesPage />)

  fireEvent.click(await screen.findByLabelText('Tự động LMS A1'))
  await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith({
    ...configured,
    autoSend: { time: '18:00', lmsEnabled: true, zaloEnabled: false },
  }))

  fireEvent.change(screen.getByLabelText('Giờ tự động A1'), {
    target: { value: '19:30' },
  })
  await waitFor(() => expect(api.saveClass).toHaveBeenLastCalledWith(
    expect.objectContaining({
      autoSend: { time: '19:30', lmsEnabled: true, zaloEnabled: false },
    }),
  ))
})

it('rolls back an inline schedule when save fails', async () => {
  const configured = {
    ...c1,
    autoSend: { time: '18:00', lmsEnabled: false, zaloEnabled: false },
  }
  stub({
    listClasses: vi.fn(async () => [configured]),
    saveClass: vi.fn(async () => { throw new Error('Không lưu được') }),
  })
  render(<ClassesPage />)
  fireEvent.click(await screen.findByLabelText('Tự động LMS A1'))
  await waitFor(() => expect(screen.getByText(/không lưu được/i)).toBeInTheDocument())
  expect(screen.getByLabelText('Tự động LMS A1')).not.toBeChecked()
})
```

Replace the old ClassEditor auto-send test with:

```ts
it('does not render auto-send configuration in the class editor', () => {
  render(<ClassEditor cls={base} onDone={() => {}} />)
  expect(screen.queryByText(/gửi tự động/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run renderer tests and confirm RED**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx src/renderer/src/pages/ClassEditor.test.tsx
```

Expected: FAIL because controls are still in ClassEditor and not on class cards.

- [ ] **Step 3: Implement optimistic card autosave with rollback**

In `ClassesPage.tsx`, add:

```ts
const [savingSchedules, setSavingSchedules] = useState<Set<string>>(new Set())

const saveSchedule = async (
  cls: SchoolClass,
  autoSend: AutoSendConfig,
): Promise<void> => {
  const previous = cls
  const updated = { ...cls, autoSend }
  setClasses(items => items.map(item => item.id === cls.id ? updated : item))
  setSavingSchedules(ids => new Set(ids).add(cls.id))
  try {
    await window.api.saveClass(updated)
    setError(null)
  } catch (err) {
    setClasses(items => items.map(item => item.id === cls.id ? previous : item))
    setError(`Không lưu được lịch tự động của ${cls.code}: ${(err as Error).message}`)
  } finally {
    setSavingSchedules(ids => {
      const next = new Set(ids)
      next.delete(cls.id)
      return next
    })
  }
}
```

Render on each class card:

```tsx
<div className="auto-send-controls" aria-label={`Lịch tự động ${c.code}`}>
  <input
    type="time"
    className="input input-auto"
    aria-label={`Giờ tự động ${c.code}`}
    value={c.autoSend?.time ?? '18:00'}
    disabled={savingSchedules.has(c.id)}
    onChange={event => void saveSchedule(c, {
      time: event.target.value,
      lmsEnabled: c.autoSend?.lmsEnabled ?? false,
      zaloEnabled: c.autoSend?.zaloEnabled ?? false,
    })}
  />
  <label className="check compact">
    <input
      type="checkbox"
      aria-label={`Tự động LMS ${c.code}`}
      checked={c.autoSend?.lmsEnabled ?? false}
      disabled={savingSchedules.has(c.id)}
      onChange={event => void saveSchedule(c, {
        time: c.autoSend?.time ?? '18:00',
        lmsEnabled: event.target.checked,
        zaloEnabled: c.autoSend?.zaloEnabled ?? false,
      })}
    />
    LMS
  </label>
  <label className="check compact">
    <input
      type="checkbox"
      aria-label={`Tự động Zalo ${c.code}`}
      checked={c.autoSend?.zaloEnabled ?? false}
      disabled={savingSchedules.has(c.id)}
      onChange={event => void saveSchedule(c, {
        time: c.autoSend?.time ?? '18:00',
        lmsEnabled: c.autoSend?.lmsEnabled ?? false,
        zaloEnabled: event.target.checked,
      })}
    />
    Zalo
  </label>
</div>
```

Use `.auto-send-controls` CSS with `display:flex`, `align-items:center`, `gap:8px`, and `flex-wrap:wrap`. Remove the obsolete text-only `autoSend.enabled` badge.

- [ ] **Step 4: Remove auto-send state and markup from ClassEditor**

Delete `autoSend`, `setAutoSendEnabled`, `setAutoSendTime`, and the entire “Gửi tự động” section. Do not strip `autoSend` from the saved class object; the untouched field remains in `draft`.

- [ ] **Step 5: Run renderer tests and typecheck**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx src/renderer/src/pages/ClassEditor.test.tsx
npm.cmd run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/renderer/src/pages/ClassesPage.tsx src/renderer/src/pages/ClassesPage.test.tsx src/renderer/src/pages/ClassEditor.tsx src/renderer/src/pages/ClassEditor.test.tsx src/renderer/src/styles.css
git commit -m "feat: edit auto-send schedules on class cards"
```

---

### Task 5: Startup catch-up notice and result summary

**Files:**
- Modify: `src/renderer/src/pages/ClassesPage.tsx`
- Modify: `src/renderer/src/pages/ClassesPage.test.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: Task 3 `window.api.getAutoSendCatchUp()` and `runAutoSendCatchUp()`.
- Produces: one startup notice with `Gửi bù tất cả`, `Để sau`, and per-class results.

- [ ] **Step 1: Add failing UI tests for startup display, defer, execution, and errors**

Add these tests:

```ts
it('shows startup catch-up items without sending automatically', async () => {
  const api = stub({
    getAutoSendCatchUp: vi.fn(async () => [catchUpItem]),
    runAutoSendCatchUp: vi.fn(async () => []),
  })
  render(<ClassesPage />)
  expect(await screen.findByText(/có lịch gửi bị bỏ lỡ/i)).toBeInTheDocument()
  expect(screen.getByText(/A1/)).toBeInTheDocument()
  expect(screen.getByText(/LMS.*Zalo/i)).toBeInTheDocument()
  expect(api.runAutoSendCatchUp).not.toHaveBeenCalled()
})

it('Để sau closes the notice without sending', async () => {
  const api = stub({
    getAutoSendCatchUp: vi.fn(async () => [catchUpItem]),
    runAutoSendCatchUp: vi.fn(async () => []),
  })
  render(<ClassesPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Để sau' }))
  expect(screen.queryByText(/có lịch gửi bị bỏ lỡ/i)).not.toBeInTheDocument()
  expect(api.runAutoSendCatchUp).not.toHaveBeenCalled()
})

it('Gửi bù tất cả disables controls and renders per-class results', async () => {
  const api = stub({
    getAutoSendCatchUp: vi.fn(async () => [catchUpItem]),
    runAutoSendCatchUp: vi.fn(async () => [catchUpSuccess, catchUpError]),
  })
  render(<ClassesPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Gửi bù tất cả' }))
  await waitFor(() => expect(api.runAutoSendCatchUp).toHaveBeenCalledOnce())
  expect(await screen.findByText(/A1.*thành công/i)).toBeInTheDocument()
  expect(screen.getByText(/B2.*lỗi/i)).toBeInTheDocument()
})
```

Update the shared `stub()` so catch-up methods default to resolved empty arrays.

- [ ] **Step 2: Run the focused renderer test and confirm RED**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/ClassesPage.test.tsx
```

Expected: FAIL because the notice does not exist.

- [ ] **Step 3: Implement the startup notice state and actions**

In `ClassesPage.tsx`, add:

```ts
const [catchUpItems, setCatchUpItems] = useState<AutoSendCatchUpItem[]>([])
const [catchUpResults, setCatchUpResults] = useState<AutoSendCatchUpResult[]>([])
const [catchUpOpen, setCatchUpOpen] = useState(true)
const [catchUpRunning, setCatchUpRunning] = useState(false)

useEffect(() => {
  if (!active) return
  void window.api.getAutoSendCatchUp()
    .then(setCatchUpItems)
    .catch(err => setError(`Không đọc được lịch gửi bù: ${(err as Error).message}`))
}, [])

const runCatchUp = async (): Promise<void> => {
  setCatchUpRunning(true)
  try {
    const results = await window.api.runAutoSendCatchUp()
    setCatchUpResults(results)
    setCatchUpItems([])
    await reload()
  } catch (err) {
    setError(`Không chạy được gửi bù: ${(err as Error).message}`)
  } finally {
    setCatchUpRunning(false)
  }
}
```

Render a card above the class list only while `catchUpOpen && catchUpItems.length > 0`. List class code/name, formatted session time, and enabled missing channels. Disable both buttons while running; `Để sau` calls `setCatchUpOpen(false)`, and `Gửi bù tất cả` calls `runCatchUp()`.

Render `catchUpResults` as a separate summary card so the result remains visible after the pending notice closes. Use:

```tsx
const RESULT_LABEL = {
  success: 'thành công',
  skipped: 'bỏ qua',
  error: 'lỗi',
} as const
```

- [ ] **Step 4: Add compact, non-modal styling**

Add `.catch-up-card`, `.catch-up-list`, `.catch-up-result-success`, `.catch-up-result-skipped`, and `.catch-up-result-error` styles. Reuse existing `.card`, `.alert`, `.btn-row`, and color variables; do not add a new modal component.

- [ ] **Step 5: Run all feature tests**

Run:

```powershell
npm.cmd test -- src/shared/autoSend.test.ts src/main/classes/ClassRepository.test.ts src/main/automation/AutoSendScheduler.test.ts src/main/ipcHandlers.test.ts src/renderer/src/pages/ClassEditor.test.tsx src/renderer/src/pages/ClassesPage.test.tsx
```

Expected: exit 0 with no failing tests.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/renderer/src/pages/ClassesPage.tsx src/renderer/src/pages/ClassesPage.test.tsx src/renderer/src/styles.css
git commit -m "feat: confirm missed auto-send jobs on startup"
```

---

### Task 6: Full regression and production verification

**Files:**
- Modify only files required to fix a regression found by these commands.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified Phase 1 build with no test or TypeScript regression.

- [ ] **Step 1: Run the complete automated test suite**

```powershell
npm.cmd test
```

Expected: every test passes; no unhandled rejection or worker error.

- [ ] **Step 2: Run both TypeScript projects**

```powershell
npm.cmd run typecheck
```

Expected: exit 0 for `tsconfig.node.json` and `tsconfig.web.json`.

- [ ] **Step 3: Build the production Electron bundles**

```powershell
npm.cmd run build
```

Expected: exit 0 and fresh `out/main`, `out/preload`, and `out/renderer` bundles.

- [ ] **Step 4: Review the final scoped diff**

```powershell
git status --short
git diff --check
git log --oneline -6
```

Expected: no whitespace error; only known pre-existing unrelated changes remain unstaged.

- [ ] **Step 5: Manual smoke test**

Run:

```powershell
npm.cmd run dev
```

Verify:

1. Each class card shows one time field and separate LMS/Zalo switches.
2. Reloading preserves each saved value.
3. ClassEditor no longer shows duplicate schedule controls.
4. With a prepared overdue running class, opening the app shows the catch-up card but performs no send.
5. `Để sau` closes it and no periodic send occurs in that app session.
6. On another launch, `Gửi bù tất cả` shows a per-class result.
7. A class not due at startup still runs after its configured time.

- [ ] **Step 6: Commit only if verification required a fix**

```powershell
git add src/shared/types.ts src/shared/autoSend.ts src/shared/autoSend.test.ts src/main/classes/ClassRepository.ts src/main/classes/ClassRepository.test.ts src/main/automation/AutoSendScheduler.ts src/main/automation/AutoSendScheduler.test.ts src/main/ipcHandlers.ts src/main/ipcHandlers.test.ts src/main/index.ts src/preload/index.ts src/renderer/src/pages/ClassEditor.tsx src/renderer/src/pages/ClassEditor.test.tsx src/renderer/src/pages/ClassesPage.tsx src/renderer/src/pages/ClassesPage.test.tsx src/renderer/src/styles.css
git commit -m "fix: address auto-send regression"
```

Before this command, use `git diff --name-only` and remove every unchanged path from the `git add` arguments. If no listed feature file changed during verification, do not create an empty commit.
