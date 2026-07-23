# Zalo Web Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the current session message through Zalo Web from both `SessionComposer` and the per-class scheduler, using the fixed search term `Dương` and the first search result.

**Architecture:** Add a persistent-profile `ZaloWebAutomator` in the Electron main process and expose one transactional IPC operation that reloads source data, sends, verifies, and persists `zaloSentAt`. The scheduler calls the same automator contract instead of writing `.txt` files. A shared `WorkflowMutex` coordinates LMS and Zalo browser side effects, while the Zalo automator also owns all Zalo page state and debug artifacts.

**Tech Stack:** TypeScript, Electron IPC, React 18, Playwright persistent context, Vitest, Testing Library.

## Global Constraints

- The Phase 3 search term is exactly `Dương`.
- Always select the first visible search result.
- Clear any existing composer draft before inserting the new message.
- Only persist `zaloSentAt` after the composer is empty and the newest outgoing message matches the sent text.
- A missing login opens Zalo Web, returns `login-required`, and leaves `zaloSentAt` unset.
- A failed post-send verification must not automatically retry.
- Keep the persistent Zalo profile under `app.getPath('userData')`.
- Store HTML and screenshot debug artifacts for selector and verification failures.
- Do not use Zalo's private HTTP APIs.

---

## File Structure

- Create `src/main/automation/ZaloWebAutomator.ts`: persistent browser lifecycle, login detection, search, compose, send, verification, debug capture.
- Create `src/main/automation/ZaloWebAutomator.test.ts`: browser workflow tests with injected Playwright fakes.
- Modify `src/main/automation/LmsAutomator.ts`: accept an optional shared `WorkflowMutex`.
- Modify `src/shared/types.ts`: Zalo result/request contracts, IPC key, and renderer API.
- Modify `src/main/ipcHandlers.ts`: transactional manual-send handler.
- Modify `src/main/ipcHandlers.test.ts`: latest-data, idempotency, success, login-required, and error tests.
- Modify `src/preload/index.ts`: expose the manual Zalo send operation.
- Modify `src/main/index.ts`: construct/wire/close the automator and register IPC.
- Modify `src/renderer/src/pages/SessionComposer.tsx`: pending state, `Gửi Zalo` button, success/login/error feedback.
- Modify `src/renderer/src/pages/SessionComposer.test.tsx`: renderer behavior.
- Modify `src/main/automation/AutoSendScheduler.ts`: replace the file adapter with the automator contract.
- Modify `src/main/automation/AutoSendScheduler.test.ts`: scheduler success/login/error/idempotency tests.

### Task 1: Shared Zalo contracts and verification normalization

**Files:**
- Create: `src/main/automation/ZaloWebAutomator.ts`
- Create: `src/main/automation/ZaloWebAutomator.test.ts`
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `ZALO_TEST_SEARCH_TERM: 'Dương'`
- Produces: `normalizeZaloMessage(text: string): string`
- Produces: `ZaloSendResult = { status: 'sent' } | { status: 'login-required'; message: string }`
- Produces: `ZaloSendSessionRequest = { classId: string; sessionId: string }`
- Produces: `ZaloSendSessionResult = { status: 'sent' | 'already-sent' | 'login-required'; message: string; content: SessionContent }`

- [ ] **Step 1: Write failing contract and normalization tests**

```ts
// src/main/automation/ZaloWebAutomator.test.ts
import { describe, expect, it } from 'vitest'
import {
  normalizeZaloMessage,
  ZALO_TEST_SEARCH_TERM,
} from './ZaloWebAutomator'

describe('Zalo Web helpers', () => {
  it('uses the approved Phase 3 search term', () => {
    expect(ZALO_TEST_SEARCH_TERM).toBe('Dương')
  })

  it('normalizes NBSP, CRLF and repeated whitespace for bubble verification', () => {
    expect(normalizeZaloMessage('A\u00a0B\r\n C  D ')).toBe('A B\nC D')
  })
})
```

Add a type-only test to `src/shared/types.test.ts` by assigning all three result variants:

```ts
const results: ZaloSendSessionResult[] = [
  { status: 'sent', message: 'Đã gửi Zalo.', content },
  { status: 'already-sent', message: 'Buổi này đã gửi Zalo.', content },
  { status: 'login-required', message: 'Cần đăng nhập Zalo Web.', content },
]
expect(results.map(result => result.status)).toEqual([
  'sent',
  'already-sent',
  'login-required',
])
```

- [ ] **Step 2: Run the target tests and verify RED**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloWebAutomator.test.ts src/shared/types.test.ts
```

Expected: FAIL because the Zalo module and shared contracts do not exist.

- [ ] **Step 3: Add the shared types and minimal helper**

```ts
// src/shared/types.ts
export type ZaloSendResult =
  | { status: 'sent' }
  | { status: 'login-required'; message: string }

export interface ZaloSendSessionRequest {
  classId: string
  sessionId: string
}

export interface ZaloSendSessionResult {
  status: 'sent' | 'already-sent' | 'login-required'
  message: string
  content: SessionContent
}
```

```ts
// src/main/automation/ZaloWebAutomator.ts
export const ZALO_TEST_SEARCH_TERM = 'Dương' as const

export function normalizeZaloMessage(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
}
```

- [ ] **Step 4: Run the target tests and typecheck**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloWebAutomator.test.ts src/shared/types.test.ts
npm.cmd run typecheck
```

Expected: all target tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/shared/types.ts src/shared/types.test.ts src/main/automation/ZaloWebAutomator.ts src/main/automation/ZaloWebAutomator.test.ts
git commit -m "feat: add Zalo Web send contracts"
```

### Task 2: Persistent Zalo Web browser workflow

**Files:**
- Modify: `src/main/automation/ZaloWebAutomator.ts`
- Modify: `src/main/automation/ZaloWebAutomator.test.ts`
- Modify: `src/main/automation/LmsAutomator.ts`
- Modify: `src/main/automation/LmsAutomator.test.ts`

**Interfaces:**
- Consumes: `ZaloSendResult`, `WorkflowMutex`, `ZALO_TEST_SEARCH_TERM`, `normalizeZaloMessage`
- Produces: `new ZaloWebAutomator(profileDir: string, options?: ZaloWebAutomatorOptions)`
- Produces: `sendMessage(input: { searchTerm: string; message: string }): Promise<ZaloSendResult>`
- Produces: `close(): Promise<void>`
- Produces: `LmsAutomator` constructor option `workflowMutex?: WorkflowMutex`

- [ ] **Step 1: Write failing browser workflow tests**

Use injected fakes so tests never launch Chromium:

```ts
const harness = createZaloHarness()
const automator = new ZaloWebAutomator('C:/tmp/zalo-test', {
  launchPersistentContext: harness.launch,
  workflowMutex: new WorkflowMutex(),
})

it('opens login page and returns login-required without typing', async () => {
  harness.setLoggedIn(false)
  await expect(automator.sendMessage({
    searchTerm: 'Dương',
    message: 'Xin chào',
  })).resolves.toEqual({
    status: 'login-required',
    message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
  })
  expect(harness.searchInput.fill).not.toHaveBeenCalled()
})

it('selects the first result, clears draft, sends and verifies', async () => {
  harness.setLoggedIn(true)
  harness.setSearchResults(['Dương A', 'Dương B'])
  harness.setNewestOutgoingMessage('Xin chào')

  await expect(automator.sendMessage({
    searchTerm: 'Dương',
    message: 'Xin chào',
  })).resolves.toEqual({ status: 'sent' })

  expect(harness.searchInput.fill).toHaveBeenCalledWith('Dương')
  expect(harness.searchResults[0].click).toHaveBeenCalledOnce()
  expect(harness.searchResults[1].click).not.toHaveBeenCalled()
  expect(harness.composer.press).toHaveBeenNthCalledWith(1, 'Control+A')
  expect(harness.composer.press).toHaveBeenNthCalledWith(2, 'Backspace')
  expect(harness.composer.type).toHaveBeenCalledWith('Xin chào')
  expect(harness.sendButton.click).toHaveBeenCalledOnce()
})

it('does not retry after click when verification fails', async () => {
  harness.setLoggedIn(true)
  harness.setSearchResults(['Dương'])
  harness.setNewestOutgoingMessage('Tin khác')

  await expect(automator.sendMessage({
    searchTerm: 'Dương',
    message: 'Xin chào',
  })).rejects.toThrow(/không xác nhận được/i)
  expect(harness.sendButton.click).toHaveBeenCalledOnce()
  expect(harness.saveDebug).toHaveBeenCalledOnce()
})
```

Add an LMS constructor test proving an injected mutex is retained by behavior: start two `runPostSessionExclusive` operations and assert the second begins after the first releases.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloWebAutomator.test.ts src/main/automation/LmsAutomator.test.ts
```

Expected: FAIL because the automator class and injected mutex support are missing.

- [ ] **Step 3: Implement lifecycle and selectors**

Use stable selectors in one exported selector object so real DOM corrections stay localized:

```ts
export const ZALO_SELECTORS = {
  loggedInShell: '#contact-search-input',
  searchInput: '#contact-search-input[data-id="txt_Main_Search"]',
  searchResult: '.ReactVirtualized__List .conv-item[id^="friend-item-"], .ReactVirtualized__List .conv-item[id^="group-item-"]',
  composer: '#chat-input-container-id #richInput',
  sendButton: '#chat-input-container-id .send-msg-btn[data-translate-title="STR_SEND"]',
  outgoingBubble: '.message-frame.me [data-id="div_SentMsg_Text"] .text',
} as const
```

These selectors come from the live HTML supplied on 2026-07-23. The search-result selector deliberately excludes `.search-message__item`, because Phase 3 must pick the first contact/group result instead of a historical message match.

Implement `ensureContext()` with:

```ts
this.context = await this.launchPersistentContext(this.profileDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
})
this.page = this.context.pages()[0] ?? await this.context.newPage()
await this.page.goto('https://chat.zalo.me/')
```

Implement `sendMessage()` inside the injected/shared mutex:

```ts
return this.workflowMutex.runExclusive(async () => {
  const page = await this.ensurePage()
  if (await page.locator(ZALO_SELECTORS.loggedInShell).count() === 0) {
    await page.bringToFront()
    return {
      status: 'login-required',
      message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
    }
  }

  const search = page.locator(ZALO_SELECTORS.searchInput)
  await search.fill('')
  await search.fill(input.searchTerm)

  const results = page.locator(ZALO_SELECTORS.searchResult)
  const count = await results.count()
  if (count === 0) throw new Error(`Không tìm thấy kết quả Zalo cho "${input.searchTerm}".`)
  await results.nth(0).click()

  const composer = page.locator(ZALO_SELECTORS.composer)
  await composer.click()
  await composer.press('Control+A')
  await composer.press('Backspace')
  await composer.type(input.message)
  await page.locator(ZALO_SELECTORS.sendButton).click()

  await composer.waitFor({ state: 'visible' })
  if (normalizeZaloMessage((await composer.innerText()) ?? '') !== '') {
    throw new Error('Zalo chưa xóa nội dung khỏi ô soạn sau khi gửi.')
  }

  const bubbles = page.locator(ZALO_SELECTORS.outgoingBubble)
  const bubbleCount = await bubbles.count()
  const newest = bubbleCount > 0 ? await bubbles.nth(bubbleCount - 1).innerText() : ''
  if (normalizeZaloMessage(newest) !== normalizeZaloMessage(input.message)) {
    throw new Error('Zalo không xác nhận được tin nhắn vừa gửi.')
  }
  return { status: 'sent' }
})
```

Wrap all selector/verification errors with `saveDebug(page, step)` that writes:

```ts
await fs.writeFile(join(this.profileDir, 'zalo-send-debug.html'), await page.content(), 'utf8')
await page.screenshot({
  path: join(this.profileDir, 'zalo-send-debug.png'),
  fullPage: true,
})
```

Use Playwright's `chromium.launchPersistentContext` as the default launch dependency. Do not log the message body.

- [ ] **Step 4: Share the workflow mutex with LMS**

Change the LMS constructor to accept an optional mutex without breaking tests:

```ts
constructor(
  private readonly userDataDir: string,
  private readonly workflowMutex = new WorkflowMutex(),
) {}
```

Remove any field initializer that creates a second LMS mutex. Keep `runPostSessionExclusive()` delegating to this instance.

- [ ] **Step 5: Run target tests and typecheck**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloWebAutomator.test.ts src/main/automation/LmsAutomator.test.ts
npm.cmd run typecheck
```

Expected: target tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/main/automation/ZaloWebAutomator.ts src/main/automation/ZaloWebAutomator.test.ts src/main/automation/LmsAutomator.ts src/main/automation/LmsAutomator.test.ts
git commit -m "feat: automate Zalo Web messages"
```

### Task 3: Transactional manual-send IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/main/ipcHandlers.test.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `ZaloSendSessionRequest`, `ZaloSendSessionResult`, `buildZaloMessage`, `ZaloWebAutomator.sendMessage`
- Produces: `IPC.zaloSendSession = 'zalo:sendSession'`
- Produces: `AppApi.zaloSendSession(request): Promise<ZaloSendSessionResult>`
- Produces: `IpcDeps.sendZaloMessage(input): Promise<ZaloSendResult>`

- [ ] **Step 1: Write failing IPC tests**

```ts
it('reloads current data, sends and persists zaloSentAt only after sent', async () => {
  const api = createIpcHandlers(stub({
    sendZaloMessage: vi.fn(async () => ({ status: 'sent' })),
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  }))

  const result = await api.zaloSendSession({ classId: 'c1', sessionId: 's1' })

  expect(deps.sendZaloMessage).toHaveBeenCalledWith({
    searchTerm: 'Dương',
    message: expect.stringContaining('Lớp A1'),
  })
  expect(contentRepository.updateMetadata).toHaveBeenCalledWith('s1', {
    zaloSentAt: '2026-07-23T12:00:00.000Z',
  })
  expect(result.status).toBe('sent')
})

it('does not invoke Zalo when latest content is already sent', async () => {
  contentRepository.get.mockResolvedValue({ ...content, zaloSentAt: 'existing' })
  const result = await api.zaloSendSession({ classId: 'c1', sessionId: 's1' })
  expect(result.status).toBe('already-sent')
  expect(deps.sendZaloMessage).not.toHaveBeenCalled()
})

it('returns login-required without persisting metadata', async () => {
  deps.sendZaloMessage.mockResolvedValue({
    status: 'login-required',
    message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
  })
  const result = await api.zaloSendSession({ classId: 'c1', sessionId: 's1' })
  expect(result.status).toBe('login-required')
  expect(contentRepository.updateMetadata).not.toHaveBeenCalled()
})
```

Also test missing class, missing session, and missing content with exact Vietnamese errors.

- [ ] **Step 2: Run IPC tests and verify RED**

Run:

```powershell
npm.cmd test -- src/main/ipcHandlers.test.ts
```

Expected: FAIL because `zaloSendSession` and its dependencies are missing.

- [ ] **Step 3: Add the IPC contract and implementation**

Add:

```ts
// shared/types.ts
zaloSendSession: 'zalo:sendSession',

// AppApi
zaloSendSession(request: ZaloSendSessionRequest): Promise<ZaloSendSessionResult>
```

Implement the handler as a data transaction around the automator call. The automator itself owns the shared browser mutex:

```ts
zaloSendSession: async request => {
  const classes = await deps.getRepository()
  const cls = await classes.get(request.classId)
  if (!cls) throw new Error('Không tìm thấy lớp để gửi Zalo.')

  const session = cls.sessions.find(item => item.id === request.sessionId)
  if (!session) throw new Error('Không tìm thấy buổi học để gửi Zalo.')

  const contents = await deps.getContentRepository()
  const content = await contents.get(request.sessionId)
  if (!content) throw new Error('Buổi học chưa có nội dung để gửi Zalo.')
  if (content.zaloSentAt) {
    return {
      status: 'already-sent',
      message: 'Buổi này đã gửi Zalo.',
      content,
    }
  }

  const config = await deps.configStore.load()
  const message = buildZaloMessage(cls, session, content, config.zaloMessageTemplate)
  const sendResult = await deps.sendZaloMessage({
    searchTerm: ZALO_TEST_SEARCH_TERM,
    message,
  })
  if (sendResult.status === 'login-required') {
    return { ...sendResult, content }
  }

  const zaloSentAt = deps.now().toISOString()
  const persisted = await contents.updateMetadata(request.sessionId, { zaloSentAt })
  const updated = persisted ?? { ...content, zaloSentAt }
  return { status: 'sent', message: 'Đã gửi Zalo.', content: updated }
},
```

- [ ] **Step 4: Expose through preload**

```ts
zaloSendSession: request => ipcRenderer.invoke(IPC.zaloSendSession, request),
```

- [ ] **Step 5: Run IPC/preload-related tests and typecheck**

Run:

```powershell
npm.cmd test -- src/main/ipcHandlers.test.ts src/shared/types.test.ts
npm.cmd run typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/shared/types.ts src/main/ipcHandlers.ts src/main/ipcHandlers.test.ts src/preload/index.ts
git commit -m "feat: send session messages through Zalo IPC"
```

### Task 4: Manual `Gửi Zalo` UI

**Files:**
- Modify: `src/renderer/src/pages/SessionComposer.tsx`
- Modify: `src/renderer/src/pages/SessionComposer.test.tsx`

**Interfaces:**
- Consumes: `window.api.zaloSendSession({ classId, sessionId })`
- Produces: a `Gửi Zalo` button inside the open preview section
- Produces: pending copy `Đang gửi Zalo...`

- [ ] **Step 1: Write failing renderer tests**

```ts
it('sends the current session and refreshes persisted metadata', async () => {
  api.zaloSendSession.mockResolvedValue({
    status: 'sent',
    message: 'Đã gửi Zalo.',
    content: { ...content, zaloSentAt: '2026-07-23T12:00:00.000Z' },
  })
  renderComposer()
  fireEvent.click(await screen.findByRole('button', { name: 'Xem trước Zalo' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Gửi Zalo' }))

  await waitFor(() => expect(api.zaloSendSession).toHaveBeenCalledWith({
    classId: 'c1',
    sessionId: 's1',
  }))
  expect(await screen.findByText('Đã gửi Zalo.')).toBeInTheDocument()
})

it('locks conflicting mutations while Zalo is pending', async () => {
  api.zaloSendSession.mockReturnValue(new Promise(() => {}))
  renderComposer()
  fireEvent.click(await screen.findByRole('button', { name: 'Xem trước Zalo' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Gửi Zalo' }))
  expect(screen.getByRole('button', { name: 'Đang gửi Zalo...' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
})

it('shows login-required without claiming success', async () => {
  api.zaloSendSession.mockResolvedValue({
    status: 'login-required',
    message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
    content,
  })
  renderComposer()
  fireEvent.click(await screen.findByRole('button', { name: 'Xem trước Zalo' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Gửi Zalo' }))
  expect(await screen.findByText(/cần đăng nhập Zalo Web/i)).toBeInTheDocument()
  expect(screen.queryByText('Đã gửi Zalo.')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/SessionComposer.test.tsx
```

Expected: FAIL because the button and handler do not exist.

- [ ] **Step 3: Add operation state and handler**

Extend the existing operation union/state with `zalo`. Implement:

```ts
const sendToZalo = async (): Promise<void> => {
  if (contentLocked || !beginOperation('zalo')) return
  try {
    const result = await window.api.zaloSendSession({
      classId: cls.id,
      sessionId: session.id,
    })
    setContent(reconcileContentWithRoster(cls, result.content))
    setZaloStatus(result.message)
    setError(null)
  } catch (err) {
    setZaloStatus(null)
    setError((err as Error).message)
  } finally {
    endOperation('zalo')
  }
}
```

Add the button beside `Copy tin nhắn`:

```tsx
<button
  className="btn btn-sm btn-primary"
  onClick={() => void sendToZalo()}
  disabled={contentLocked}
>
  {zaloPosting ? 'Đang gửi Zalo...' : 'Gửi Zalo'}
</button>
```

Render `zaloStatus` as `role="status"`. Treat both `already-sent` and `sent` as informational success; render `login-required` using the returned message without setting `zaloSentAt` locally.

- [ ] **Step 4: Run renderer tests and typecheck**

Run:

```powershell
npm.cmd test -- src/renderer/src/pages/SessionComposer.test.tsx
npm.cmd run typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/renderer/src/pages/SessionComposer.tsx src/renderer/src/pages/SessionComposer.test.tsx
git commit -m "feat: send Zalo messages from session preview"
```

### Task 5: Scheduler uses Zalo Web

**Files:**
- Modify: `src/main/automation/AutoSendScheduler.ts`
- Modify: `src/main/automation/AutoSendScheduler.test.ts`

**Interfaces:**
- Consumes: `sendZaloMessage(input: { searchTerm: string; message: string }): Promise<ZaloSendResult>`
- Produces: scheduler persistence only for `{ status: 'sent' }`
- Removes: production use of `writeZaloMessageToDocuments`

- [ ] **Step 1: Replace scheduler test dependency and add failing cases**

Change the test stub:

```ts
sendZaloMessage: vi.fn(async () => ({ status: 'sent' as const })),
```

Add:

```ts
it('keeps Zalo pending when login is required', async () => {
  deps.sendZaloMessage.mockResolvedValue({
    status: 'login-required',
    message: 'Cần đăng nhập Zalo Web rồi gửi lại.',
  })
  await scheduler.tick()
  expect(deps.updateContentMetadata).not.toHaveBeenCalledWith(
    's1',
    expect.objectContaining({ zaloSentAt: expect.any(String) }),
  )
})

it('uses the fixed search term and the shared message builder', async () => {
  await scheduler.tick()
  expect(deps.sendZaloMessage).toHaveBeenCalledWith({
    searchTerm: 'Dương',
    message: expect.stringContaining('Lớp A1'),
  })
})

it('does not retry or mark sent when automator verification rejects', async () => {
  deps.sendZaloMessage.mockRejectedValue(new Error('Zalo không xác nhận được tin nhắn vừa gửi.'))
  await scheduler.tick()
  expect(deps.sendZaloMessage).toHaveBeenCalledOnce()
  expect(deps.updateContentMetadata).not.toHaveBeenCalledWith(
    's1',
    expect.objectContaining({ zaloSentAt: expect.any(String) }),
  )
})
```

- [ ] **Step 2: Run scheduler tests and verify RED**

Run:

```powershell
npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts
```

Expected: FAIL because the scheduler still expects `writeZaloMessage`.

- [ ] **Step 3: Replace the adapter**

Change the dependency:

```ts
sendZaloMessage: (input: {
  searchTerm: string
  message: string
}) => Promise<ZaloSendResult>
```

Replace the send/persist block:

```ts
const message = buildZaloMessage(cls, session, latest, cfg.zaloMessageTemplate)
const result = await this.deps.sendZaloMessage({
  searchTerm: ZALO_TEST_SEARCH_TERM,
  message,
})
if (result.status === 'login-required') {
  log(`[AutoSend] ${cls.code}: ${result.message}`)
  return latest
}

const zaloSentAt = (this.deps.now?.() ?? new Date()).toISOString()
const persisted = await this.deps.updateContentMetadata(session.id, { zaloSentAt })
return persisted ?? { ...latest, zaloSentAt }
```

Delete `writeZaloMessageToDocuments` and its `node:fs`/`node:path` imports when no longer referenced.

- [ ] **Step 4: Run scheduler/shared tests and typecheck**

Run:

```powershell
npm.cmd test -- src/main/automation/AutoSendScheduler.test.ts src/shared/autoSend.test.ts
npm.cmd run typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/main/automation/AutoSendScheduler.ts src/main/automation/AutoSendScheduler.test.ts
git commit -m "feat: send scheduled messages through Zalo Web"
```

### Task 6: Main-process wiring, shutdown, and integration verification

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipcHandlers.test.ts`
- Modify: `src/smoke.test.ts` only if the existing smoke stub requires the new API method

**Interfaces:**
- Consumes: `ZaloWebAutomator`, shared `WorkflowMutex`, `handlers.zaloSendSession`
- Produces: one persistent Zalo profile at `<userData>/zalo-browser`
- Produces: IPC registration for `IPC.zaloSendSession`
- Produces: clean shutdown of LMS and Zalo browser contexts

- [ ] **Step 1: Add a failing wiring/typecheck expectation**

Update the central test stubs to include:

```ts
zaloSendSession: vi.fn(),
```

Run:

```powershell
npm.cmd run typecheck
```

Expected: FAIL until `src/main/index.ts` provides the new handler dependencies and scheduler contract.

- [ ] **Step 2: Construct the shared workflow and automators**

```ts
const externalWorkflowMutex = new WorkflowMutex()
const lmsAutomator = new LmsAutomator(
  join(app.getPath('userData'), 'lms-browser'),
  externalWorkflowMutex,
)
const zaloAutomator = new ZaloWebAutomator(
  join(app.getPath('userData'), 'zalo-browser'),
  { workflowMutex: externalWorkflowMutex },
)
```

Wire both manual and scheduled calls:

```ts
sendZaloMessage: input => zaloAutomator.sendMessage(input),
now: () => new Date(),
```

Do not wrap `zaloAutomator.sendMessage()` in the same mutex twice. The final implementation must choose exactly one owner:

- manual IPC and scheduler call `zaloAutomator.sendMessage()` directly;
- `ZaloWebAutomator.sendMessage()` owns the shared mutex;
- LMS continues using the same injected mutex.

Register:

```ts
ipcMain.handle(
  IPC.zaloSendSession,
  (_event, request) => handlers.zaloSendSession(request),
)
```

The IPC handler's data transaction must not acquire a second workflow lock around `sendMessage`; it performs data reads before the automator call and metadata persistence after the call.

- [ ] **Step 3: Close both browser contexts**

```ts
app.on('before-quit', () => {
  void Promise.all([
    lmsAutomator.close(),
    zaloAutomator.close(),
  ])
})
```

- [ ] **Step 4: Run focused integration tests**

Run:

```powershell
npm.cmd test -- src/main/automation/ZaloWebAutomator.test.ts src/main/automation/AutoSendScheduler.test.ts src/main/ipcHandlers.test.ts src/renderer/src/pages/SessionComposer.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: all tests PASS, typecheck exits 0, production build exits 0, and `git diff --check` prints no errors.

- [ ] **Step 6: Commit wiring**

```powershell
git add -- src/main/index.ts src/main/ipcHandlers.test.ts src/smoke.test.ts
git commit -m "feat: wire Zalo Web automation"
```

- [ ] **Step 7: Perform the real-site smoke test**

Run:

```powershell
npm.cmd run dev
```

Then:

1. Open a session with saved content.
2. Open `Xem trước Zalo`.
3. Click `Gửi Zalo`.
4. If prompted, sign in to the separate Zalo Web window and click `Gửi Zalo` again.
5. Confirm search is `Dương`.
6. Confirm the first result is opened.
7. Confirm any existing draft is replaced.
8. Confirm exactly one new outgoing message appears.
9. Confirm reopening the session reports it already sent and does not send again.

If a selector fails, collect these generated artifacts before changing code:

```text
<userData>/zalo-browser/zalo-send-debug.html
<userData>/zalo-browser/zalo-send-debug.png
```

Update only `ZALO_SELECTORS` from evidence in those artifacts, add a regression fixture/test for the observed DOM, rerun Step 5, and make one corrective commit:

```powershell
git add -- src/main/automation/ZaloWebAutomator.ts src/main/automation/ZaloWebAutomator.test.ts
git commit -m "fix: align Zalo Web selectors with live DOM"
```
