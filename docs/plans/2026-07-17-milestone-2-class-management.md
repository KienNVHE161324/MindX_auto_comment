# Milestone 2 — Class Management (manual) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Thực thi theo TDD, mỗi task 1 commit.

**Goal:** Mô hình dữ liệu lớp/học sinh/buổi học + màn hình quản lý lớp (danh sách, thêm/sửa/xóa lớp, quản lý học sinh & buổi học) — nhập tay, lưu qua `StorageProvider` local. Không phụ thuộc LMS.

**Architecture:** Domain type thuần trong `shared/`. `ClassRepository` CRUD trên `StorageProvider` (collection `classes`). IPC mở rộng `AppApi` với 4 method lớp; main dựng repository từ config hiện tại mỗi lần gọi. UI thêm điều hướng 2 tab (Cấu hình / Lớp học), trang danh sách lớp và trình soạn lớp.

**Tech Stack:** (kế thừa M1) Electron, electron-vite, React 18, TypeScript, Vitest, @testing-library/react.

## Global Constraints
- TypeScript strict.
- Dữ liệu lớp lưu qua `StorageProvider` (collection `classes`, id = `SchoolClass.id`). Giai đoạn này chỉ backend local.
- Sinh id bằng `globalThis.crypto.randomUUID()` (chạy được ở cả main lẫn renderer/test).
- "Tự động thêm lớp từ LMS" KHÔNG thuộc M2 (milestone sau, cần Playwright + cấu trúc LMS).
- Ở local mode single-user, mọi lớp trong thư mục là của người dùng (quyền sở hữu ngầm).

## File Structure
```
src/shared/
  types.ts        # + Student, ClassSession, SchoolClass; + 4 method vào AppApi; + IPC channels lớp
  id.ts           # newId()
src/main/
  classes/
    ClassRepository.ts   # CRUD trên StorageProvider
  ipcHandlers.ts  # + class handlers (dep getRepository)
  index.ts        # + wiring class IPC + getRepository từ config
src/preload/index.ts     # + expose class methods
src/renderer/src/
  App.tsx                # nav 2 tab
  pages/ClassesPage.tsx  # danh sách + thêm/xóa, mở editor
  pages/ClassEditor.tsx  # sửa code/name/students/sessions + lưu
```

---

### Task 1: Domain types + newId

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/id.ts`
- Test: `src/shared/id.test.ts`

**Interfaces — Produces:**
- `interface Student { id: string; name: string; note?: string }`
- `interface ClassSession { id: string; dateTime: string; label?: string }` (dateTime = ISO 8601)
- `interface SchoolClass { id: string; code: string; name: string; students: Student[]; sessions: ClassSession[] }`
- `function newId(): string`
- Mở rộng `AppApi` (khai báo, hiện thực ở Task 3): `listClasses(): Promise<SchoolClass[]>`, `getClass(id: string): Promise<SchoolClass | null>`, `saveClass(cls: SchoolClass): Promise<void>`, `deleteClass(id: string): Promise<void>`
- Mở rộng `IPC`: `listClasses: 'class:list'`, `getClass: 'class:get'`, `saveClass: 'class:save'`, `deleteClass: 'class:delete'`

- [ ] **Step 1: Viết failing test** `src/shared/id.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { newId } from './id'

describe('newId', () => {
  it('trả chuỗi không rỗng', () => {
    expect(typeof newId()).toBe('string')
    expect(newId().length).toBeGreaterThan(0)
  })
  it('mỗi lần gọi ra id khác nhau', () => {
    expect(newId()).not.toBe(newId())
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/shared/id.test.ts` → FAIL (module chưa có).

- [ ] **Step 3: Viết** `src/shared/id.ts`
```ts
export function newId(): string {
  return globalThis.crypto.randomUUID()
}
```

- [ ] **Step 4: Mở rộng `src/shared/types.ts`** — thêm vào cuối file (trước/sau tùy, miễn hợp lệ):
```ts
export interface Student {
  id: string
  name: string
  note?: string
}

export interface ClassSession {
  id: string
  /** ISO 8601 datetime của buổi học, vd "2026-07-20T18:00:00" */
  dateTime: string
  label?: string
}

export interface SchoolClass {
  id: string
  code: string
  name: string
  students: Student[]
  sessions: ClassSession[]
}
```
Trong `IPC` (thêm 4 khóa):
```ts
  listClasses: 'class:list',
  getClass: 'class:get',
  saveClass: 'class:save',
  deleteClass: 'class:delete',
```
Trong `interface AppApi` (thêm 4 method):
```ts
  listClasses(): Promise<SchoolClass[]>
  getClass(id: string): Promise<SchoolClass | null>
  saveClass(cls: SchoolClass): Promise<void>
  deleteClass(id: string): Promise<void>
```

- [ ] **Step 5: Run** `npx vitest run src/shared/id.test.ts` → PASS. Rồi `npm run typecheck` → không lỗi (AppApi mở rộng chưa có hiện thực nhưng chỉ là type, OK).

- [ ] **Step 6: Commit**
```bash
git add src/shared/id.ts src/shared/id.test.ts src/shared/types.ts
git commit -m "feat: class domain types + newId + AppApi class methods"
```

---

### Task 2: ClassRepository

**Files:**
- Create: `src/main/classes/ClassRepository.ts`
- Test: `src/main/classes/ClassRepository.test.ts`

**Interfaces:**
- Consumes: `StorageProvider` (M1), `SchoolClass` (Task 1).
- Produces: `class ClassRepository { constructor(storage: StorageProvider); list(): Promise<SchoolClass[]>; get(id: string): Promise<SchoolClass | null>; save(cls: SchoolClass): Promise<void>; delete(id: string): Promise<void> }`. Collection cố định `'classes'`, khóa = `cls.id`.

- [ ] **Step 1: Viết failing test** `src/main/classes/ClassRepository.test.ts`
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageProvider } from '../storage/LocalStorageProvider'
import { ClassRepository } from './ClassRepository'
import { SchoolClass } from '../../shared/types'

function makeClass(id: string, code: string): SchoolClass {
  return { id, code, name: `Lớp ${code}`, students: [], sessions: [] }
}

let dir: string
let repo: ClassRepository
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cls-'))
  repo = new ClassRepository(new LocalStorageProvider(dir))
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('ClassRepository', () => {
  it('list rỗng khi chưa có lớp', async () => {
    expect(await repo.list()).toEqual([])
  })
  it('save rồi get trả lại đúng lớp', async () => {
    const c = makeClass('c1', 'A1')
    await repo.save(c)
    expect(await repo.get('c1')).toEqual(c)
  })
  it('get trả null khi không có', async () => {
    expect(await repo.get('nope')).toBeNull()
  })
  it('list trả tất cả lớp đã lưu', async () => {
    await repo.save(makeClass('c1', 'A1'))
    await repo.save(makeClass('c2', 'A2'))
    const codes = (await repo.list()).map(c => c.code).sort()
    expect(codes).toEqual(['A1', 'A2'])
  })
  it('save ghi đè lớp cùng id', async () => {
    await repo.save(makeClass('c1', 'A1'))
    await repo.save({ ...makeClass('c1', 'A1'), name: 'Đổi tên' })
    expect((await repo.get('c1'))?.name).toBe('Đổi tên')
    expect(await repo.list()).toHaveLength(1)
  })
  it('delete xóa lớp', async () => {
    await repo.save(makeClass('c1', 'A1'))
    await repo.delete('c1')
    expect(await repo.get('c1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/main/classes/ClassRepository.test.ts` → FAIL.

- [ ] **Step 3: Viết** `src/main/classes/ClassRepository.ts`
```ts
import { StorageProvider } from '../storage/StorageProvider'
import { SchoolClass } from '../../shared/types'

const COLLECTION = 'classes'

export class ClassRepository {
  constructor(private readonly storage: StorageProvider) {}

  list(): Promise<SchoolClass[]> {
    return this.storage.list<SchoolClass>(COLLECTION)
  }

  get(id: string): Promise<SchoolClass | null> {
    return this.storage.read<SchoolClass>(COLLECTION, id)
  }

  save(cls: SchoolClass): Promise<void> {
    return this.storage.write(COLLECTION, cls.id, cls)
  }

  delete(id: string): Promise<void> {
    return this.storage.delete(COLLECTION, id)
  }
}
```

- [ ] **Step 4: Run** → 6 PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/classes
git commit -m "feat: ClassRepository CRUD over StorageProvider"
```

---

### Task 3: IPC class CRUD + wiring + preload

**Files:**
- Modify: `src/main/ipcHandlers.ts` (thêm dep `getRepository` + 4 handler)
- Modify: `src/main/index.ts` (dựng `getRepository` từ config, đăng ký 4 kênh)
- Modify: `src/preload/index.ts` (expose 4 method)
- Test: `src/main/ipcHandlers.test.ts` (bổ sung case class)

**Interfaces:**
- Consumes: `ClassRepository` (Task 2), `SchoolClass`/`AppApi`/`IPC` (Task 1), `ConfigStore`+`createStorageProvider` (M1).
- Produces: `IpcDeps` thêm `getRepository: () => Promise<ClassRepository>`; `createIpcHandlers` trả `AppApi` đầy đủ (gồm 4 method lớp).

- [ ] **Step 1: Bổ sung test vào `src/main/ipcHandlers.test.ts`** — thêm khối sau vào cuối file (giữ nguyên phần cũ), và cập nhật `makeDeps` để có `getRepository`:
```ts
// Thêm import ở đầu file:
// import { SchoolClass } from '../shared/types'

describe('createIpcHandlers — class methods', () => {
  function makeClassDeps() {
    const repo = {
      list: vi.fn(async () => [] as SchoolClass[]),
      get: vi.fn(async () => null),
      save: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    }
    const base = {
      configStore: { load: vi.fn(), save: vi.fn(), update: vi.fn() },
      validateGeminiKey: vi.fn(),
      pickFolder: vi.fn(),
      getRepository: vi.fn(async () => repo),
    }
    return { base, repo }
  }

  it('listClasses ủy quyền cho repo.list', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    await api.listClasses()
    expect(repo.list).toHaveBeenCalledOnce()
  })
  it('saveClass ủy quyền cho repo.save', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    const c: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [], sessions: [] }
    await api.saveClass(c)
    expect(repo.save).toHaveBeenCalledWith(c)
  })
  it('deleteClass ủy quyền cho repo.delete', async () => {
    const { base, repo } = makeClassDeps()
    const api = createIpcHandlers(base as never)
    await api.deleteClass('c1')
    expect(repo.delete).toHaveBeenCalledWith('c1')
  })
})
```
Thêm dòng import ở đầu file test: `import { SchoolClass } from '../shared/types'`.

- [ ] **Step 2: Run** `npx vitest run src/main/ipcHandlers.test.ts` → FAIL (getRepository/handlers chưa có).

- [ ] **Step 3: Cập nhật `src/main/ipcHandlers.ts`**
```ts
import { AppApi, AppConfig, GeminiValidationResult, SchoolClass } from '../shared/types'
import { ConfigStore } from './config/configStore'
import { ClassRepository } from './classes/ClassRepository'

export interface IpcDeps {
  configStore: ConfigStore
  validateGeminiKey: (apiKey: string) => Promise<GeminiValidationResult>
  pickFolder: () => Promise<string | null>
  getRepository: () => Promise<ClassRepository>
}

export function createIpcHandlers(deps: IpcDeps): AppApi {
  return {
    getConfig: () => deps.configStore.load(),
    updateConfig: (patch: Partial<AppConfig>) => deps.configStore.update(patch),
    validateGeminiKey: (apiKey: string) => deps.validateGeminiKey(apiKey),
    pickFolder: () => deps.pickFolder(),
    listClasses: async () => (await deps.getRepository()).list(),
    getClass: async (id: string) => (await deps.getRepository()).get(id),
    saveClass: async (cls: SchoolClass) => (await deps.getRepository()).save(cls),
    deleteClass: async (id: string) => (await deps.getRepository()).delete(id),
  }
}
```

- [ ] **Step 4: Run** → PASS (4 cũ + 3 mới).

- [ ] **Step 5: Wiring `src/main/index.ts`** — trong `registerIpc()`, sau khi có `configStore`, thêm:
```ts
  const getRepository = async (): Promise<ClassRepository> => {
    const cfg = await configStore.load()
    return new ClassRepository(createStorageProvider(cfg))
  }
```
Cập nhật `createIpcHandlers({ ... , getRepository })`. Thêm import:
```ts
import { createStorageProvider } from './storage'
import { ClassRepository } from './classes/ClassRepository'
```
Đăng ký 4 kênh (sau các `ipcMain.handle` cũ):
```ts
  ipcMain.handle(IPC.listClasses, () => handlers.listClasses())
  ipcMain.handle(IPC.getClass, (_e, id: string) => handlers.getClass(id))
  ipcMain.handle(IPC.saveClass, (_e, cls) => handlers.saveClass(cls))
  ipcMain.handle(IPC.deleteClass, (_e, id: string) => handlers.deleteClass(id))
```

- [ ] **Step 6: Preload `src/preload/index.ts`** — thêm vào object `api`:
```ts
  listClasses: () => ipcRenderer.invoke(IPC.listClasses),
  getClass: (id) => ipcRenderer.invoke(IPC.getClass, id),
  saveClass: (cls) => ipcRenderer.invoke(IPC.saveClass, cls),
  deleteClass: (id) => ipcRenderer.invoke(IPC.deleteClass, id),
```

- [ ] **Step 7: Run** `npm run typecheck` → không lỗi; `npm run build` → OK.

- [ ] **Step 8: Commit**
```bash
git add -A
git commit -m "feat: IPC class CRUD + repository wiring + preload"
```

---

### Task 4: App navigation + ClassesPage (danh sách, thêm/xóa)

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/pages/ClassesPage.tsx`
- Test: `src/renderer/src/pages/ClassesPage.test.tsx`

**Interfaces:**
- Consumes: `window.api.listClasses/deleteClass/saveClass`, `SchoolClass`, `newId`.
- Produces: `ClassesPage` — tải & hiển thị danh sách lớp (code, name, số HS, số buổi); nút "Thêm lớp" mở editor với lớp mới; click lớp mở editor; nút "Xóa" gọi `deleteClass` rồi tải lại. Khi chưa cấu hình thư mục (listClasses reject) hiển thị thông báo nhắc vào Cấu hình.

**Behavior pinned bởi test** (`ClassesPage.test.tsx`, `// @vitest-environment jsdom`):
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ClassesPage from './ClassesPage'
import { SchoolClass } from '../../../shared/types'

function stub(overrides: Partial<Window['api']> = {}) {
  const api = {
    getConfig: vi.fn(), updateConfig: vi.fn(), validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
    listClasses: vi.fn(async () => [] as SchoolClass[]),
    getClass: vi.fn(), saveClass: vi.fn(async () => {}), deleteClass: vi.fn(async () => {}),
    ...overrides,
  }
  ;(window as unknown as { api: Window['api'] }).api = api as Window['api']
  return api
}
beforeEach(() => stub())

const c1: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [{ id: 's1', name: 'An' }], sessions: [] }

describe('ClassesPage', () => {
  it('hiển thị "chưa có lớp" khi danh sách rỗng', async () => {
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText(/chưa có lớp/i)).toBeInTheDocument())
  })
  it('liệt kê lớp đã có (mã + tên + số HS)', async () => {
    stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.getByText(/Lớp A1/)).toBeInTheDocument()
    expect(screen.getByText(/1 học sinh/i)).toBeInTheDocument()
  })
  it('bấm "Thêm lớp" mở trình soạn (hiện ô Mã lớp)', async () => {
    render(<ClassesPage />)
    await waitFor(() => screen.getByText(/thêm lớp/i))
    fireEvent.click(screen.getByText(/thêm lớp/i))
    await waitFor(() => expect(screen.getByLabelText(/mã lớp/i)).toBeInTheDocument())
  })
  it('bấm "Xóa" gọi deleteClass rồi tải lại', async () => {
    const api = stub({ listClasses: vi.fn(async () => [c1]) })
    render(<ClassesPage />)
    await waitFor(() => screen.getByText('A1'))
    fireEvent.click(screen.getByLabelText(/xóa lớp A1/i))
    await waitFor(() => expect(api.deleteClass).toHaveBeenCalledWith('c1'))
    expect(api.listClasses).toHaveBeenCalledTimes(2)
  })
  it('báo lỗi khi listClasses thất bại (chưa cấu hình thư mục)', async () => {
    stub({ listClasses: vi.fn(async () => { throw new Error('Chưa chọn thư mục') }) })
    render(<ClassesPage />)
    await waitFor(() => expect(screen.getByText(/chưa chọn thư mục/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 1: Viết test trên** → **Step 2: Run** → FAIL.

- [ ] **Step 3: Viết `src/renderer/src/pages/ClassesPage.tsx`** — component quản lý 2 chế độ (list | edit). Ở chế độ list: `useEffect` gọi `listClasses` (try/catch → state error); render danh sách card mỗi lớp gồm `code`, `name`, `"{n} học sinh"`, nút "Sửa" (mở editor) và nút có `aria-label={`Xóa lớp ${code}`}` gọi `deleteClass(id)` rồi reload; nút "Thêm lớp" đặt `editing = lớp mới` `{ id: newId(), code:'', name:'', students:[], sessions:[] }`. Khi rỗng hiển thị "Chưa có lớp nào." Ở chế độ edit: render `<ClassEditor cls={editing} onDone={() => { setEditing(null); reload() }} />` (ClassEditor làm ở Task 5 — ở Task 4 tạm import; nếu Task 5 chưa có, dùng editor tạm chỉ hiện ô "Mã lớp" để test Task 4 xanh, rồi Task 5 thay bằng bản đầy đủ). Để tránh phụ thuộc ngược, Task 4 tạo sẵn `ClassEditor.tsx` tối thiểu chỉ gồm ô `<label>Mã lớp<input/></label>` + nút "Xong" gọi `onDone`; Task 5 mở rộng.

- [ ] **Step 4: `App.tsx`** — nav 2 tab:
```tsx
import { useState } from 'react'
import SettingsPage from './pages/SettingsPage'
import ClassesPage from './pages/ClassesPage'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<'classes' | 'settings'>('classes')
  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setTab('classes')} disabled={tab === 'classes'}>Lớp học</button>
        <button onClick={() => setTab('settings')} disabled={tab === 'settings'}>Cấu hình</button>
      </nav>
      {tab === 'classes' ? <ClassesPage /> : <SettingsPage />}
    </div>
  )
}
```

- [ ] **Step 5: Run** `npx vitest run src/renderer/src/pages/ClassesPage.test.tsx` → PASS (5). Rồi `npm run typecheck`.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: app navigation + ClassesPage (list/add/delete)"
```

---

### Task 5: ClassEditor (sửa mã/tên + học sinh + buổi học)

**Files:**
- Modify: `src/renderer/src/pages/ClassEditor.tsx` (mở rộng bản tối thiểu từ Task 4)
- Test: `src/renderer/src/pages/ClassEditor.test.tsx`

**Interfaces:**
- Props: `{ cls: SchoolClass; onDone: () => void }`.
- Consumes: `window.api.saveClass`, `newId`.
- Produces: form sửa `code`, `name`; thêm/xóa học sinh (id + name); thêm/xóa buổi học (id + dateTime); nút "Lưu" gọi `saveClass(clsHiệnTại)` rồi `onDone()`; nút "Quay lại" gọi `onDone()`.

**Behavior pinned bởi test** (`ClassEditor.test.tsx`, `// @vitest-environment jsdom`):
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ClassEditor from './ClassEditor'
import { SchoolClass } from '../../../shared/types'

function stub() {
  const api = {
    getConfig: vi.fn(), updateConfig: vi.fn(), validateGeminiKey: vi.fn(), pickFolder: vi.fn(),
    listClasses: vi.fn(), getClass: vi.fn(), saveClass: vi.fn(async () => {}), deleteClass: vi.fn(),
  }
  ;(window as unknown as { api: Window['api'] }).api = api as Window['api']
  return api
}
beforeEach(() => stub())

const base: SchoolClass = { id: 'c1', code: 'A1', name: 'Lớp A1', students: [{ id: 's1', name: 'An' }], sessions: [] }

describe('ClassEditor', () => {
  it('hiển thị mã/tên/học sinh hiện có', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    expect(screen.getByLabelText(/mã lớp/i)).toHaveValue('A1')
    expect(screen.getByLabelText(/tên lớp/i)).toHaveValue('Lớp A1')
    expect(screen.getByDisplayValue('An')).toBeInTheDocument()
  })
  it('thêm học sinh tạo ô nhập mới', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm học sinh/i))
    expect(screen.getAllByPlaceholderText(/tên học sinh/i).length).toBe(2)
  })
  it('sửa mã rồi Lưu gọi saveClass với mã mới', async () => {
    const api = stub()
    const onDone = vi.fn()
    render(<ClassEditor cls={base} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText(/mã lớp/i), { target: { value: 'B2' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() => expect(api.saveClass).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', code: 'B2' })))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
  it('thêm buổi học tạo ô datetime mới', () => {
    render(<ClassEditor cls={base} onDone={() => {}} />)
    fireEvent.click(screen.getByText(/thêm buổi/i))
    expect(screen.getAllByLabelText(/thời điểm buổi/i).length).toBe(1)
  })
  it('"Quay lại" gọi onDone', () => {
    const onDone = vi.fn()
    render(<ClassEditor cls={base} onDone={onDone} />)
    fireEvent.click(screen.getByText(/quay lại/i))
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 1: Viết test** → **Step 2: Run** → FAIL (bản tối thiểu chưa có các phần này).

- [ ] **Step 3: Mở rộng `src/renderer/src/pages/ClassEditor.tsx`** — state `cls` khởi từ props; ô `code` (`<label>Mã lớp`), `name` (`<label>Tên lớp`); danh sách học sinh: mỗi em `<input placeholder="Tên học sinh"/>` + nút xóa; nút "Thêm học sinh" push `{ id: newId(), name: '' }`; danh sách buổi: mỗi buổi `<input type="datetime-local" aria-label="Thời điểm buổi"/>` + nút xóa; nút "Thêm buổi" push `{ id: newId(), dateTime: '' }`; nút "Lưu" gọi `window.api.saveClass(cls)` rồi `onDone()`; nút "Quay lại" gọi `onDone()`.

- [ ] **Step 4: Run** `npx vitest run src/renderer/src/pages/ClassEditor.test.tsx` → PASS (5).

- [ ] **Step 5: Full suite + typecheck + build**
```
npm test && npm run typecheck && npm run build
```
Expected: tất cả xanh, typecheck sạch, build OK.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: ClassEditor (code/name/students/sessions)"
```

---

## Nghiệm thu Milestone 2
- Toàn bộ test xanh; typecheck sạch; build OK.
- Từ tab "Lớp học": thêm lớp, nhập mã/tên, thêm học sinh & buổi học, lưu; danh sách hiển thị lại; xóa lớp được; dữ liệu tồn tại trong thư mục local đã cấu hình (mở lại app vẫn còn).
- Chưa cấu hình thư mục → ClassesPage nhắc vào Cấu hình.

## Ngoài phạm vi M2 (milestone sau)
- "Tự động thêm lớp từ LMS" (Playwright + cấu trúc LMS).
- Soạn nội dung buổi (bài học/nhận xét/bài tập) + Gemini — Milestone 3.
- Các Minor trong `docs/plans/backlog-m2.md` (validate thư mục trước lưu, loading state nút kiểm tra key).
