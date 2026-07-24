# Zalo PC Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Zalo Web with Windows UI Automation for Zalo PC and only send the Zalo message after LMS has conclusively handled every student.

**Architecture:** A pure shared LMS-result assessor decides whether Zalo is allowed. A focused Node-to-PowerShell bridge invokes a Windows UI Automation script, while `ZaloDesktopAutomator` owns serialization and result mapping. Manual and scheduled delivery both use the same LMS-first orchestration and only persist `zaloSentAt` after desktop confirmation.

**Tech Stack:** TypeScript, Electron, Vitest, Node `child_process`, Windows PowerShell 5.1, .NET `UIAutomationClient`/`UIAutomationTypes`.

## Global Constraints

- Zalo PC is the only Zalo transport; Zalo Web is removed with no fallback.
- During testing, search for exact term `Dương` and select the first result.
- LMS always runs before Zalo so confirmed absences are persisted before message generation.
- A student is absent only when LMS explicitly returns that student in `absentStudentNames`.
- Any non-absent student not present in `posted` blocks the complete Zalo send.
- Any LMS session-level error blocks Zalo.
- Only confirmed Zalo delivery writes `zaloSentAt`.
- UI Automation is primary; keyboard input is allowed only after the target control is identified.
- Fixed screen coordinates are not allowed.

---

### Task 1: Strict LMS completion assessment

**Files:**
- Create: `src/shared/lmsDelivery.ts`
- Create: `src/shared/lmsDelivery.test.ts`

**Interfaces:**
- Consumes: `Student`, `LmsPostResult`.
- Produces: `assessLmsDelivery(students, result, priorEvidence?): LmsDeliveryAssessment`, including handled student IDs for persistence.

- [ ] **Step 1: Write failing tests for complete, absent, failed and ambiguous students**

```ts
import { describe, expect, it } from 'vitest'
import { assessLmsDelivery } from './lmsDelivery'

const students = [
  { id: 's1', name: 'Lương Ngọc Việt' },
  { id: 's2', name: 'Nguyễn Sách Sâm' },
]

describe('assessLmsDelivery', () => {
  it('allows Zalo when every student is posted or explicitly absent', () => {
    expect(assessLmsDelivery(students, {
      posted: ['Lương Ngọc Việt'],
      skipped: ['Nguyễn Sách Sâm'],
      absentStudentNames: ['Nguyễn Sách Sâm'],
    })).toEqual({
      complete: true,
      blockers: [],
      postedStudentIds: ['s1'],
      absentStudentIds: ['s2'],
    })
  })

  it('blocks a skipped student who was not explicitly absent', () => {
    expect(assessLmsDelivery(students, {
      posted: ['Lương Ngọc Việt'],
      skipped: ['Nguyễn Sách Sâm (lỗi: timeout)'],
      absentStudentNames: [],
    })).toEqual({
      complete: false,
      blockers: ['Nguyễn Sách Sâm'],
      postedStudentIds: ['s1'],
      absentStudentIds: [],
    })
  })

  it('blocks session-level LMS errors', () => {
    expect(assessLmsDelivery(students, {
      posted: [],
      skipped: [],
      absentStudentNames: [],
      error: 'Không tìm thấy buổi học',
    })).toEqual({
      complete: false,
      blockers: ['LMS: Không tìm thấy buổi học'],
      postedStudentIds: [],
      absentStudentIds: [],
    })
  })
})
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm.cmd test -- src/shared/lmsDelivery.test.ts`

Expected: FAIL because `./lmsDelivery` does not exist.

- [ ] **Step 3: Implement normalized exact-name assessment**

```ts
import { LmsPostResult, Student } from './types'

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
  priorEvidence: {
    postedStudentIds?: string[]
    absentStudentIds?: string[]
  } = {},
): LmsDeliveryAssessment {
  if (result.error) {
    return {
      complete: false,
      blockers: [`LMS: ${result.error}`],
      postedStudentIds: priorEvidence.postedStudentIds ?? [],
      absentStudentIds: priorEvidence.absentStudentIds ?? [],
    }
  }
  const postedNames = new Set(result.posted.map(normalizeName))
  const absentNames = new Set(result.absentStudentNames.map(normalizeName))
  const postedStudentIds = [...new Set([
    ...(priorEvidence.postedStudentIds ?? []),
    ...students.filter(s => postedNames.has(normalizeName(s.name))).map(s => s.id),
  ])]
  const absentStudentIds = [...new Set([
    ...(priorEvidence.absentStudentIds ?? []),
    ...students.filter(s => absentNames.has(normalizeName(s.name))).map(s => s.id),
  ])]
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
```

- [ ] **Step 4: Run focused tests and all shared tests**

Run: `npm.cmd test -- src/shared/lmsDelivery.test.ts src/shared/lmsSync.test.ts src/shared/autoSend.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/lmsDelivery.ts src/shared/lmsDelivery.test.ts
git commit -m "feat: validate LMS completion before Zalo"
```

---

### Task 2: Windows UI Automation bridge

**Files:**
- Create: `src/main/automation/ZaloDesktopBridge.ts`
- Create: `src/main/automation/ZaloDesktopBridge.test.ts`
- Create: `resources/zalo-desktop-uia.ps1`

**Interfaces:**
- Produces:
  - `ZaloDesktopCommand { searchTerm: string; message: string; debugDir: string }`
  - `ZaloDesktopBridge.send(command): Promise<ZaloDesktopBridgeResult>`
  - PowerShell stdout JSON `{ status: "sent" }` or `{ status: "error", step, message }`.

- [ ] **Step 1: Write failing bridge tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { ZaloDesktopBridge } from './ZaloDesktopBridge'

describe('ZaloDesktopBridge', () => {
  it('passes JSON through stdin and maps a sent response', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"status":"sent"}',
      stderr: '',
    }))
    const bridge = new ZaloDesktopBridge('C:/app/resources/zalo-desktop-uia.ps1', run)
    await expect(bridge.send({
      searchTerm: 'Dương',
      message: 'Xin chào',
      debugDir: 'C:/debug',
    })).resolves.toEqual({ status: 'sent' })
    expect(run).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        'C:/app/resources/zalo-desktop-uia.ps1'],
      expect.stringContaining('"searchTerm":"Dương"'),
    )
  })

  it('throws a step-specific error returned by PowerShell', async () => {
    const run = vi.fn(async () => ({
      exitCode: 1,
      stdout: '{"status":"error","step":"search","message":"Không thấy ô tìm kiếm"}',
      stderr: '',
    }))
    const bridge = new ZaloDesktopBridge('script.ps1', run)
    await expect(bridge.send({
      searchTerm: 'Dương', message: 'x', debugDir: 'C:/debug',
    })).rejects.toThrow('Zalo PC [search]: Không thấy ô tìm kiếm')
  })
})
```

- [ ] **Step 2: Run the bridge tests and confirm RED**

Run: `npm.cmd test -- src/main/automation/ZaloDesktopBridge.test.ts`

Expected: FAIL because the bridge module does not exist.

- [ ] **Step 3: Implement the typed PowerShell runner**

Implement `runPowerShell(executable, args, stdin)` with `spawn`, UTF-8 stdin/stdout capture, an exit handler, and JSON parsing. Set:

```ts
export const POWERSHELL_EXE =
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
```

Reject malformed output and map `{ status: "error" }` to:

```ts
throw new Error(`Zalo PC [${result.step}]: ${result.message}`)
```

- [ ] **Step 4: Implement the PowerShell UI Automation workflow**

The script must:

```powershell
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$zalo = Get-Process -Name Zalo -ErrorAction SilentlyContinue | Select-Object -First 1
```

If missing, inspect these executable candidates in order and start the first existing one:

```powershell
"$env:LOCALAPPDATA\Programs\Zalo\Zalo.exe"
"$env:LOCALAPPDATA\Zalo\Zalo.exe"
"$env:APPDATA\Zalo\Zalo.exe"
```

Use `AutomationElement.FromHandle($zalo.MainWindowHandle)`, restore/foreground the window through a small `user32.dll` `Add-Type`, and query descendants with `TreeScope.Descendants`.

Select controls by accessibility properties rather than coordinates:

- search edit: `ControlType.Edit` whose `AutomationId` or `Name` contains `search`, `tìm kiếm`, or `txt_Main_Search`;
- first result: first enabled `ListItem` or `DataItem` after the search value changes;
- composer: enabled `Edit` or `Document` whose name contains `message`, `tin nhắn`, `soạn`, or `richInput`;
- send: enabled `Button` whose name contains `send` or `gửi`.

Use `ValuePattern.SetValue` when supported. Otherwise focus the already identified element and use `System.Windows.Forms.SendKeys` for `Ctrl+A`, Backspace, and Unicode text through the clipboard. Invoke the result and send controls with `InvokePattern` or `SelectionItemPattern`.

After sending, poll descendants for up to 10 seconds until a text-bearing element normalizes to the requested message. Return compact JSON on stdout. On failure, save:

- `zalo-desktop-controls.json` containing `Name`, `AutomationId`, `ControlType`, `IsEnabled`;
- `zalo-desktop-error.png` via `System.Drawing.CopyFromScreen`;
- a JSON error result with the exact failed step.

- [ ] **Step 5: Run bridge tests and syntax-check the script**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloDesktopBridge.test.ts
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path resources/zalo-desktop-uia.ps1),
  [ref]$null,
  [ref]$errors
) | Out-Null
if ($errors.Count) { $errors | Format-List; exit 1 }
```

Expected: tests PASS and PowerShell parser returns no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/main/automation/ZaloDesktopBridge.ts src/main/automation/ZaloDesktopBridge.test.ts resources/zalo-desktop-uia.ps1
git commit -m "feat: add Zalo PC UI Automation bridge"
```

---

### Task 3: Replace the web automator with the desktop adapter

**Files:**
- Create: `src/main/automation/ZaloDesktopAutomator.ts`
- Create: `src/main/automation/ZaloDesktopAutomator.test.ts`
- Delete: `src/main/automation/ZaloWebAutomator.ts`
- Delete: `src/main/automation/ZaloWebAutomator.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/main/automation/AutoSendScheduler.ts`
- Modify: `electron-builder.yml`

**Interfaces:**
- Consumes: `ZaloDesktopBridge`, `WorkflowMutex`.
- Produces: `ZALO_TEST_SEARCH_TERM = "Dương"` and `sendMessage({ searchTerm, message }): Promise<ZaloSendResult>`.

- [ ] **Step 1: Write failing desktop automator tests**

Test that it passes exact Unicode `Dương`, serializes through the shared mutex, maps success to `{ status: "sent" }`, and never references a browser profile or `chat.zalo.me`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test -- src/main/automation/ZaloDesktopAutomator.test.ts`

Expected: FAIL because the desktop automator does not exist.

- [ ] **Step 3: Implement the minimal desktop automator**

```ts
export const ZALO_TEST_SEARCH_TERM = 'Dương' as const

export class ZaloDesktopAutomator {
  constructor(
    private readonly bridge: ZaloDesktopBridge,
    private readonly debugDir: string,
    private readonly workflowMutex = new WorkflowMutex(),
  ) {}

  sendMessage(input: { searchTerm: string; message: string }): Promise<ZaloSendResult> {
    return this.workflowMutex.runExclusive(async () => {
      await this.bridge.send({ ...input, debugDir: this.debugDir })
      return { status: 'sent' }
    })
  }

  async close(): Promise<void> {}
}
```

- [ ] **Step 4: Wire resources and remove all Zalo Web imports**

Resolve the script path from `process.resourcesPath` in packaged mode and the repository `resources` directory in development. Add the PowerShell file to Electron Builder resources. Replace imports in IPC and scheduler with the desktop constant. Remove Chromium profile construction and instantiate the desktop bridge/automator in `main/index.ts`.

- [ ] **Step 5: Run focused tests and search for web remnants**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloDesktopAutomator.test.ts src/main/ipcHandlers.test.ts src/main/automation/AutoSendScheduler.test.ts
rg -n "ZaloWebAutomator|chat\.zalo\.me|zalo-browser" src resources electron-builder.yml
```

Expected: tests PASS; `rg` returns no matches.

- [ ] **Step 6: Commit**

```powershell
git add src/main/automation src/main/index.ts src/main/ipcHandlers.ts src/main/automation/AutoSendScheduler.ts electron-builder.yml resources
git commit -m "feat: replace Zalo Web with Zalo PC"
```

---

### Task 4: LMS-first combined manual workflow

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/content/ContentRepository.ts`
- Modify: `src/main/content/ContentRepository.test.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/main/ipcHandlers.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/pages/SessionComposer.tsx`
- Modify: `src/renderer/src/pages/SessionComposer.test.tsx`

**Interfaces:**
- Produces:
  - IPC `sendSessionToLmsAndZalo`.
  - `SessionDeliveryResult { status: "sent" | "blocked" | "already-sent"; message; postResult; content }`.
  - Persisted `SessionContent.lmsPostedStudentIds`.

- [ ] **Step 1: Write failing IPC tests for strict ordering**

Add tests whose event log proves:

```ts
expect(events).toEqual(['lms', 'save-absence', 'build-zalo', 'zalo', 'save-zalo'])
```

Also assert:

- explicit absence plus all remaining students posted allows Zalo;
- skipped non-absent student returns `blocked` and never calls `sendZaloMessage`;
- LMS `error` returns `blocked`;
- `zaloSentAt` is unchanged on every blocked path.

- [ ] **Step 2: Run IPC tests and confirm RED**

Run: `npm.cmd test -- src/main/ipcHandlers.test.ts`

Expected: FAIL because combined delivery IPC is missing.

- [ ] **Step 3: Implement one main-process orchestration**

Add `lmsPostedStudentIds?: string[]` to `SessionContent` and include it in the repository's monotonic metadata merge.

Load the class, session, latest content and config. Build `LmsPostParams` from all students not already present in `absentStudentIds`, using non-empty polished/raw comments. Call LMS through `runLmsPostExclusive`, then run:

```ts
const assessment = assessLmsDelivery(cls.students, postResult, {
  postedStudentIds: current.lmsPostedStudentIds,
  absentStudentIds: current.absentStudentIds,
})
```

Persist `assessment.postedStudentIds` and `assessment.absentStudentIds` before deciding whether to send Zalo. Only names explicitly returned by LMS in `posted` or `absentStudentNames` may add new evidence.

When assessment is incomplete, return:

```ts
{
  status: 'blocked',
  message: `Không gửi Zalo vì LMS chưa hoàn tất: ${assessment.blockers.join(', ')}`,
  postResult,
  content: updatedContent,
}
```

Only after a complete assessment, reload persisted content, build the Zalo message, call the desktop adapter, and write `zaloSentAt`.

- [ ] **Step 4: Replace the renderer's separate action with one button**

Expose the IPC in preload. Replace the independent `sendToZalo` call with `sendSessionToLmsAndZalo`. Label the preview action `Gửi LMS & Zalo`, disable it for the full workflow, and show:

- `Đang gửi LMS...`
- blocked message from main;
- `Đang gửi Zalo...`
- `Đã gửi LMS & Zalo.`

Refresh content and Zalo preview only after the LMS response is persisted.

- [ ] **Step 5: Run IPC and renderer tests**

Run:

```powershell
npm.cmd test -- src/main/ipcHandlers.test.ts src/renderer/src/pages/SessionComposer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/types.ts src/main/content src/main/ipcHandlers.ts src/main/ipcHandlers.test.ts src/preload/index.ts src/renderer/src/pages/SessionComposer.tsx src/renderer/src/pages/SessionComposer.test.tsx
git commit -m "feat: send LMS before Zalo PC"
```

---

### Task 5: Apply the same LMS gate to scheduled delivery

**Files:**
- Modify: `src/main/automation/AutoSendScheduler.ts`
- Modify: `src/main/automation/AutoSendScheduler.test.ts`

**Interfaces:**
- Consumes: persisted `lmsPostedStudentIds`, `absentStudentIds`, and `assessLmsDelivery`.
- Produces: scheduled LMS-first behavior identical to manual delivery.

- [ ] **Step 1: Write failing scheduler tests**

Cover:

- explicit absence plus posted attendees sends Zalo;
- an attendee timeout in `skipped` blocks Zalo;
- session-level LMS error blocks Zalo;
- scheduler never calls Zalo before LMS persistence;
- a prior `postedToLms` value alone does not bypass strict per-student validation unless the current run has a conclusive stored delivery result.

- [ ] **Step 2: Run scheduler tests and confirm RED**

Run: `npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts`

Expected: at least the non-absent skipped case fails because current scheduler still attempts Zalo.

- [ ] **Step 3: Reuse the conclusive LMS delivery evidence**

After the LMS result, call `assessLmsDelivery` with the existing evidence, persist its returned ID arrays, and reload the content. The scheduler may skip re-posting only when every current class student ID occurs in one of the two persisted evidence sets.

After any LMS run, reload the persisted content and allow Zalo only when:

```ts
const handled = new Set([
  ...(content.lmsPostedStudentIds ?? []),
  ...(content.absentStudentIds ?? []),
])
const blockers = cls.students.filter(student => !handled.has(student.id))
```

Log blocker names and leave `zaloSentAt` empty when blockers exist.

- [ ] **Step 4: Run scheduler, content repository and shared tests**

Run:

```powershell
npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts src/main/content/ContentRepository.test.ts src/shared/lmsDelivery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/types.ts src/main/content src/main/automation/AutoSendScheduler.ts src/main/automation/AutoSendScheduler.test.ts
git commit -m "fix: block scheduled Zalo on incomplete LMS"
```

---

### Task 6: Full verification and live Zalo PC smoke test

**Files:**
- Modify only if the live accessibility dump identifies a concrete selector mismatch:
  - `resources/zalo-desktop-uia.ps1`
  - matching tests.

**Interfaces:**
- Verifies the complete feature; produces no new API.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: all tests PASS, typecheck/build exit 0, and no whitespace errors.

- [ ] **Step 2: Run development Electron with Zalo PC logged in**

Run: `npm.cmd run dev`

Open a session with complete comments and click `Gửi LMS & Zalo`. Confirm LMS runs first and Zalo PC comes to the foreground only after LMS completes.

- [ ] **Step 3: Verify the live success path**

Confirm:

- search contains exactly `Dương`;
- the first result is selected;
- any old draft is removed;
- the preview text is sent once;
- `zaloSentAt` appears only after the sent message is visible.

- [ ] **Step 4: Verify the live blocked path**

Cause or select a session where one attending student lacks a successful LMS result. Confirm the UI names that student, Zalo PC does not receive focus, no message is sent, and `zaloSentAt` remains empty.

- [ ] **Step 5: Inspect diagnostics if live control discovery fails**

Open `zalo-desktop-controls.json` and `zalo-desktop-error.png`. Change only the accessibility-property predicates evidenced by that dump, add a regression test for the discovered property values, then repeat Steps 1–4.

- [ ] **Step 6: Commit any evidence-driven selector adjustment**

```powershell
git add resources/zalo-desktop-uia.ps1 src/main/automation
git commit -m "fix: align Zalo PC accessibility controls"
```

Skip this commit when no adjustment is needed.
