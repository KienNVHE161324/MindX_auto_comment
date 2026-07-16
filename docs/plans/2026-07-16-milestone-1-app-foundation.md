# Milestone 1 — App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng khung app desktop (Electron + React + TypeScript) mở được cửa sổ, có màn hình Cấu hình để chọn kho dữ liệu, chỉ định thư mục local, nhập & kiểm tra API key Gemini, và lưu template tin nhắn Zalo — tất cả được lưu bền vững và test được.

**Architecture:** Electron 3 tiến trình (main / preload / renderer). Logic lõi (config, storage, gemini) là các module thuần Node, **nhận đường dẫn/hàm qua tham số (dependency injection)** để test bằng Vitest không cần chạy Electron. Preload dùng `contextBridge` expose một API gõ kiểu tới renderer; main đăng ký `ipcMain.handle` mỏng, ủy quyền cho các handler thuần đã test riêng.

**Tech Stack:** Electron, electron-vite, Vite, React 18, TypeScript, Vitest, @testing-library/react, jsdom.

## Global Constraints

- Ngôn ngữ: **TypeScript** (strict mode bật).
- Nền tảng đích: **Windows** (Electron desktop).
- **Bí mật giữ tại máy:** API key Gemini và (sau này) phiên đăng nhập KHÔNG bao giờ đưa lên cloud. Ở M1, config lưu tại `app.getPath('userData')/config.json`.
- **Storage backend** là một interface; M1 chỉ hiện thực `local` đầy đủ. `supabase` là giá trị hợp lệ trong config nhưng UI đánh dấu "chưa khả dụng (bản sau)".
- Template Zalo mặc định (verbatim), dùng làm `DEFAULT_ZALO_TEMPLATE`:
  ```
  @All Em xin gửi nhận xét buổi học của các học sinh lớp {ten_lop} ngày {ngay_buoi_hoc} ạ
  Nội dung bài học:
  {noi_dung_bai_hoc}
  Nhận xét từng học sinh:
  {danh_sach_nhan_xet}
  Bài tập về nhà:
  {bai_tap_ve_nha}
  Cảm ơn phụ huynh và các con!
  ```
- Tất cả code viết trong thư mục repo: `C:\Users\Beam1\MindX_auto_comment`.
- Mỗi task kết thúc bằng một commit.

---

## File Structure

```
src/
  shared/
    types.ts            # DTO dùng chung: AppConfig, StorageBackend, GeminiValidationResult, AppApi, IPC channels, DEFAULT_*
  main/
    index.ts            # Composition root: tạo window, lấy userData path, wiring ipcMain.handle
    ipcHandlers.ts      # createIpcHandlers(deps) — logic thuần, test được
    config/
      configStore.ts    # ConfigStore(baseDir): load/save/update config.json
    storage/
      StorageProvider.ts # interface StorageProvider
      LocalStorageProvider.ts # hiện thực local (JSON theo collection/id)
      index.ts          # createStorageProvider(config): factory
    gemini/
      geminiClient.ts   # validateGeminiApiKey(key, fetchFn)
  preload/
    index.ts            # contextBridge expose window.api (AppApi) qua ipcRenderer.invoke
  renderer/
    index.html
    src/
      main.tsx          # React entry
      App.tsx           # khung, render SettingsPage
      pages/
        SettingsPage.tsx # form cấu hình
      env.d.ts          # khai báo window.api cho TypeScript
```

Test đặt cạnh file nguồn (`*.test.ts` / `*.test.tsx`).

---

### Task 1: Project scaffold (Electron + Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: (none)
- Produces: bộ script `npm run dev`, `npm test`, `npm run typecheck`; cấu trúc thư mục ở trên.

- [ ] **Step 1: Tạo `.gitignore`**

```
node_modules/
out/
dist/
*.log
.DS_Store
```

- [ ] **Step 2: Tạo `package.json`**

```json
{
  "name": "mindx-auto-comment",
  "version": "0.1.0",
  "description": "App tự động nhận xét học sinh trên Zalo và LMS",
  "main": "./out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
  }
}
```

- [ ] **Step 3: Cài dependencies**

Run:
```bash
npm install electron@^31 electron-vite@^2 vite@^5 react@^18 react-dom@^18
npm install -D typescript@^5 @types/react@^18 @types/react-dom@^18 @types/node@^20 @vitejs/plugin-react@^4 vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```
Expected: cài xong, `node_modules/` xuất hiện.

- [ ] **Step 4: Tạo `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } },
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } } },
    plugins: [react()],
  },
})
```

- [ ] **Step 5: Tạo các tsconfig**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "composite": true,
    "noEmit": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "composite": true,
    "noEmit": true
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 6: Tạo `vitest.config.ts`** (mặc định môi trường `node`; test UI tự khai báo jsdom bằng comment)

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 7: Tạo entry Electron tối thiểu**

`src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:
```ts
// Task 5 sẽ mở rộng file này. Tạm thời để trống hợp lệ.
export {}
```

`src/renderer/index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>MindX Auto Comment</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/renderer/src/App.tsx`:
```tsx
export default function App(): JSX.Element {
  return <h1>MindX Auto Comment</h1>
}
```

- [ ] **Step 8: Viết smoke test**

`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('môi trường test chạy được', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 9: Chạy test để chắc chắn PASS**

Run: `npm test`
Expected: 1 file test, 1 test PASS.

- [ ] **Step 10: Chạy thử app (kiểm tra thủ công)**

Run: `npm run dev`
Expected: cửa sổ Electron mở, hiển thị tiêu đề "MindX Auto Comment". Đóng cửa sổ.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + React + TS + Vitest"
```

---

### Task 2: Shared types & default config

**Files:**
- Create: `src/shared/types.ts`
- Test: `src/shared/types.test.ts`

**Interfaces:**
- Consumes: (none)
- Produces:
  - `type StorageBackend = 'local' | 'supabase'`
  - `interface AppConfig { storageBackend: StorageBackend; localFolderPath: string | null; geminiApiKey: string | null; zaloMessageTemplate: string }`
  - `interface GeminiValidationResult { valid: boolean; error?: string }`
  - `const DEFAULT_ZALO_TEMPLATE: string`
  - `const DEFAULT_CONFIG: AppConfig`
  - `const IPC` (hằng tên kênh), `interface AppApi`

- [ ] **Step 1: Viết failing test**

`src/shared/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_ZALO_TEMPLATE } from './types'

describe('DEFAULT_CONFIG', () => {
  it('mặc định backend là local, không có key/thư mục', () => {
    expect(DEFAULT_CONFIG.storageBackend).toBe('local')
    expect(DEFAULT_CONFIG.localFolderPath).toBeNull()
    expect(DEFAULT_CONFIG.geminiApiKey).toBeNull()
  })

  it('template mặc định chứa đủ 5 biến chèn', () => {
    for (const v of ['{ten_lop}', '{ngay_buoi_hoc}', '{noi_dung_bai_hoc}', '{danh_sach_nhan_xet}', '{bai_tap_ve_nha}']) {
      expect(DEFAULT_ZALO_TEMPLATE).toContain(v)
    }
  })

  it('DEFAULT_CONFIG dùng đúng template mặc định', () => {
    expect(DEFAULT_CONFIG.zaloMessageTemplate).toBe(DEFAULT_ZALO_TEMPLATE)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/shared/types.test.ts`
Expected: FAIL — không import được `./types` (chưa tồn tại).

- [ ] **Step 3: Viết `src/shared/types.ts`**

```ts
export type StorageBackend = 'local' | 'supabase'

export interface AppConfig {
  storageBackend: StorageBackend
  localFolderPath: string | null
  geminiApiKey: string | null
  zaloMessageTemplate: string
}

export interface GeminiValidationResult {
  valid: boolean
  error?: string
}

export const DEFAULT_ZALO_TEMPLATE = `@All Em xin gửi nhận xét buổi học của các học sinh lớp {ten_lop} ngày {ngay_buoi_hoc} ạ
Nội dung bài học:
{noi_dung_bai_hoc}
Nhận xét từng học sinh:
{danh_sach_nhan_xet}
Bài tập về nhà:
{bai_tap_ve_nha}
Cảm ơn phụ huynh và các con!`

export const DEFAULT_CONFIG: AppConfig = {
  storageBackend: 'local',
  localFolderPath: null,
  geminiApiKey: null,
  zaloMessageTemplate: DEFAULT_ZALO_TEMPLATE,
}

export const IPC = {
  getConfig: 'config:get',
  updateConfig: 'config:update',
  validateGeminiKey: 'gemini:validateKey',
  pickFolder: 'dialog:pickFolder',
} as const

export interface AppApi {
  getConfig(): Promise<AppConfig>
  updateConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  validateGeminiKey(apiKey: string): Promise<GeminiValidationResult>
  pickFolder(): Promise<string | null>
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/shared/types.test.ts`
Expected: 3 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat: shared types and default config"
```

---

### Task 3: ConfigStore (đọc/ghi config.json bền vững)

**Files:**
- Create: `src/main/config/configStore.ts`
- Test: `src/main/config/configStore.test.ts`

**Interfaces:**
- Consumes: `AppConfig`, `DEFAULT_CONFIG` từ `src/shared/types`.
- Produces: `class ConfigStore { constructor(baseDir: string); load(): Promise<AppConfig>; save(config: AppConfig): Promise<void>; update(patch: Partial<AppConfig>): Promise<AppConfig> }`. File lưu tại `join(baseDir, 'config.json')`.

- [ ] **Step 1: Viết failing test**

`src/main/config/configStore.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConfigStore } from './configStore'
import { DEFAULT_CONFIG } from '../../shared/types'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cfg-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('ConfigStore', () => {
  it('load trả về DEFAULT_CONFIG khi chưa có file', async () => {
    const store = new ConfigStore(dir)
    expect(await store.load()).toEqual(DEFAULT_CONFIG)
  })

  it('save rồi load trả lại đúng dữ liệu', async () => {
    const store = new ConfigStore(dir)
    const cfg = { ...DEFAULT_CONFIG, geminiApiKey: 'abc', localFolderPath: '/data' }
    await store.save(cfg)
    expect(await store.load()).toEqual(cfg)
  })

  it('update chỉ đổi field được truyền, giữ nguyên phần còn lại', async () => {
    const store = new ConfigStore(dir)
    const next = await store.update({ geminiApiKey: 'key-1' })
    expect(next.geminiApiKey).toBe('key-1')
    expect(next.storageBackend).toBe('local')
    expect((await store.load()).geminiApiKey).toBe('key-1')
  })

  it('load hợp nhất field thiếu với default (forward-compatible)', async () => {
    await fs.writeFile(join(dir, 'config.json'), JSON.stringify({ geminiApiKey: 'x' }), 'utf-8')
    const cfg = await new ConfigStore(dir).load()
    expect(cfg.geminiApiKey).toBe('x')
    expect(cfg.zaloMessageTemplate).toBe(DEFAULT_CONFIG.zaloMessageTemplate)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/main/config/configStore.test.ts`
Expected: FAIL — `ConfigStore` chưa tồn tại.

- [ ] **Step 3: Viết `src/main/config/configStore.ts`**

```ts
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppConfig, DEFAULT_CONFIG } from '../../shared/types'

export class ConfigStore {
  private readonly filePath: string

  constructor(baseDir: string) {
    this.filePath = join(baseDir, 'config.json')
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG }
      throw err
    }
  }

  async save(config: AppConfig): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf-8')
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.load()
    const next = { ...current, ...patch }
    await this.save(next)
    return next
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/main/config/configStore.test.ts`
Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/config/configStore.ts src/main/config/configStore.test.ts
git commit -m "feat: persistent ConfigStore"
```

---

### Task 4: StorageProvider interface + LocalStorageProvider

**Files:**
- Create: `src/main/storage/StorageProvider.ts`, `src/main/storage/LocalStorageProvider.ts`, `src/main/storage/index.ts`
- Test: `src/main/storage/LocalStorageProvider.test.ts`

**Interfaces:**
- Consumes: `AppConfig` từ `src/shared/types`.
- Produces:
  - `interface StorageProvider { read<T>(collection, id): Promise<T | null>; write<T>(collection, id, data): Promise<void>; list<T>(collection): Promise<T[]>; delete(collection, id): Promise<void> }`
  - `class LocalStorageProvider implements StorageProvider { constructor(baseDir: string) }` — lưu `baseDir/<collection>/<id>.json`.
  - `function createStorageProvider(config: AppConfig): StorageProvider` — trả `LocalStorageProvider` khi `local`; ném `Error` rõ ràng khi `supabase` (chưa hỗ trợ ở M1).

- [ ] **Step 1: Viết failing test**

`src/main/storage/LocalStorageProvider.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LocalStorageProvider } from './LocalStorageProvider'
import { createStorageProvider } from './index'
import { DEFAULT_CONFIG } from '../../shared/types'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'store-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

describe('LocalStorageProvider', () => {
  it('read trả null khi chưa có item', async () => {
    const p = new LocalStorageProvider(dir)
    expect(await p.read('classes', 'c1')).toBeNull()
  })

  it('write rồi read trả lại đúng object', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1', name: 'Lop A' })
    expect(await p.read('classes', 'c1')).toEqual({ id: 'c1', name: 'Lop A' })
  })

  it('list trả tất cả item trong collection', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1' })
    await p.write('classes', 'c2', { id: 'c2' })
    const items = await p.list<{ id: string }>('classes')
    expect(items.map(i => i.id).sort()).toEqual(['c1', 'c2'])
  })

  it('list trả [] khi collection chưa tồn tại', async () => {
    const p = new LocalStorageProvider(dir)
    expect(await p.list('nope')).toEqual([])
  })

  it('delete xóa item, không lỗi nếu item không tồn tại', async () => {
    const p = new LocalStorageProvider(dir)
    await p.write('classes', 'c1', { id: 'c1' })
    await p.delete('classes', 'c1')
    expect(await p.read('classes', 'c1')).toBeNull()
    await expect(p.delete('classes', 'ghost')).resolves.toBeUndefined()
  })
})

describe('createStorageProvider', () => {
  it('trả LocalStorageProvider khi backend = local', () => {
    const p = createStorageProvider({ ...DEFAULT_CONFIG, storageBackend: 'local', localFolderPath: dir })
    expect(p).toBeInstanceOf(LocalStorageProvider)
  })

  it('ném lỗi khi backend = local nhưng thiếu thư mục', () => {
    expect(() => createStorageProvider({ ...DEFAULT_CONFIG, storageBackend: 'local', localFolderPath: null }))
      .toThrow(/thư mục/i)
  })

  it('ném lỗi rõ ràng khi backend = supabase (chưa hỗ trợ M1)', () => {
    expect(() => createStorageProvider({ ...DEFAULT_CONFIG, storageBackend: 'supabase' }))
      .toThrow(/supabase/i)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/main/storage/LocalStorageProvider.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/main/storage/StorageProvider.ts`**

```ts
export interface StorageProvider {
  read<T>(collection: string, id: string): Promise<T | null>
  write<T>(collection: string, id: string, data: T): Promise<void>
  list<T>(collection: string): Promise<T[]>
  delete(collection: string, id: string): Promise<void>
}
```

- [ ] **Step 4: Viết `src/main/storage/LocalStorageProvider.ts`**

```ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { StorageProvider } from './StorageProvider'

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private dirOf(collection: string): string {
    return join(this.baseDir, collection)
  }
  private pathOf(collection: string, id: string): string {
    return join(this.dirOf(collection), `${id}.json`)
  }

  async read<T>(collection: string, id: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.pathOf(collection, id), 'utf-8')
      return JSON.parse(raw) as T
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async write<T>(collection: string, id: string, data: T): Promise<void> {
    await fs.mkdir(this.dirOf(collection), { recursive: true })
    await fs.writeFile(this.pathOf(collection, id), JSON.stringify(data, null, 2), 'utf-8')
  }

  async list<T>(collection: string): Promise<T[]> {
    let files: string[]
    try {
      files = await fs.readdir(this.dirOf(collection))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    return Promise.all(
      jsonFiles.map(async f => {
        const raw = await fs.readFile(join(this.dirOf(collection), f), 'utf-8')
        return JSON.parse(raw) as T
      }),
    )
  }

  async delete(collection: string, id: string): Promise<void> {
    try {
      await fs.unlink(this.pathOf(collection, id))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
}
```

- [ ] **Step 5: Viết `src/main/storage/index.ts`**

```ts
import { AppConfig } from '../../shared/types'
import { StorageProvider } from './StorageProvider'
import { LocalStorageProvider } from './LocalStorageProvider'

export { LocalStorageProvider }
export type { StorageProvider }

export function createStorageProvider(config: AppConfig): StorageProvider {
  if (config.storageBackend === 'local') {
    if (!config.localFolderPath) {
      throw new Error('Chưa chọn thư mục lưu dữ liệu (localFolderPath).')
    }
    return new LocalStorageProvider(config.localFolderPath)
  }
  throw new Error('Backend Supabase chưa được hỗ trợ ở bản này (sẽ có ở milestone sau).')
}
```

- [ ] **Step 6: Chạy test để xác nhận PASS**

Run: `npx vitest run src/main/storage/LocalStorageProvider.test.ts`
Expected: 8 test PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/storage
git commit -m "feat: StorageProvider interface + LocalStorageProvider + factory"
```

---

### Task 5: Gemini API key validation

**Files:**
- Create: `src/main/gemini/geminiClient.ts`
- Test: `src/main/gemini/geminiClient.test.ts`

**Interfaces:**
- Consumes: `GeminiValidationResult` từ `src/shared/types`.
- Produces: `function validateGeminiApiKey(apiKey: string, fetchFn?: typeof fetch): Promise<GeminiValidationResult>`. Gọi `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`; `fetchFn` inject được để test.

- [ ] **Step 1: Viết failing test**

`src/main/gemini/geminiClient.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { validateGeminiApiKey } from './geminiClient'

function fakeFetch(status: number): typeof fetch {
  return vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch
}

describe('validateGeminiApiKey', () => {
  it('key rỗng → không hợp lệ, không gọi mạng', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const res = await validateGeminiApiKey('', fetchFn)
    expect(res.valid).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('HTTP 200 → hợp lệ', async () => {
    const res = await validateGeminiApiKey('good-key', fakeFetch(200))
    expect(res.valid).toBe(true)
  })

  it('HTTP 400 → key sai', async () => {
    const res = await validateGeminiApiKey('bad', fakeFetch(400))
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/không hợp lệ/i)
  })

  it('HTTP 403 → key sai', async () => {
    const res = await validateGeminiApiKey('bad', fakeFetch(403))
    expect(res.valid).toBe(false)
  })

  it('HTTP 500 → lỗi máy chủ', async () => {
    const res = await validateGeminiApiKey('k', fakeFetch(500))
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/máy chủ/i)
  })

  it('fetch ném lỗi mạng → báo lỗi kết nối', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const res = await validateGeminiApiKey('k', fetchFn)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/kết nối/i)
  })

  it('gửi key qua query param đã encode', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await validateGeminiApiKey('a b&c', fetchFn)
    const calledUrl = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('key=a%20b%26c')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/main/gemini/geminiClient.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/main/gemini/geminiClient.ts`**

```ts
import { GeminiValidationResult } from '../../shared/types'

const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function validateGeminiApiKey(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeminiValidationResult> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key đang trống.' }
  }
  try {
    const res = await fetchFn(`${MODELS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`)
    if (res.ok) return { valid: true }
    if (res.status === 400 || res.status === 403) {
      return { valid: false, error: 'API key không hợp lệ.' }
    }
    return { valid: false, error: `Lỗi máy chủ Gemini (HTTP ${res.status}).` }
  } catch (err) {
    return { valid: false, error: `Lỗi kết nối: ${(err as Error).message}` }
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/main/gemini/geminiClient.test.ts`
Expected: 7 test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/gemini
git commit -m "feat: Gemini API key validation"
```

---

### Task 6: IPC handlers (logic thuần) + wiring main + preload bridge

**Files:**
- Create: `src/main/ipcHandlers.ts`
- Test: `src/main/ipcHandlers.test.ts`
- Modify: `src/main/index.ts` (wiring `ipcMain.handle`)
- Modify: `src/preload/index.ts` (expose `window.api`)
- Create: `src/renderer/src/env.d.ts` (khai báo `window.api`)

**Interfaces:**
- Consumes: `ConfigStore` (Task 3), `validateGeminiApiKey` (Task 5), `AppConfig`/`GeminiValidationResult`/`IPC`/`AppApi` (Task 2).
- Produces:
  - `interface IpcDeps { configStore: ConfigStore; validateGeminiKey: (apiKey: string) => Promise<GeminiValidationResult>; pickFolder: () => Promise<string | null> }`
  - `function createIpcHandlers(deps: IpcDeps): AppApi` (các method map 1-1 với `AppApi`).
  - `window.api` ở renderer hiện thực `AppApi`.

- [ ] **Step 1: Viết failing test**

`src/main/ipcHandlers.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { createIpcHandlers } from './ipcHandlers'
import { DEFAULT_CONFIG } from '../shared/types'

function makeDeps() {
  const configStore = {
    load: vi.fn(async () => DEFAULT_CONFIG),
    save: vi.fn(async () => {}),
    update: vi.fn(async (patch) => ({ ...DEFAULT_CONFIG, ...patch })),
  }
  const validateGeminiKey = vi.fn(async () => ({ valid: true }))
  const pickFolder = vi.fn(async () => '/chosen')
  return { configStore, validateGeminiKey, pickFolder }
}

describe('createIpcHandlers', () => {
  it('getConfig gọi configStore.load', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    expect(await api.getConfig()).toEqual(DEFAULT_CONFIG)
    expect(deps.configStore.load).toHaveBeenCalledOnce()
  })

  it('updateConfig chuyển patch tới configStore.update', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    const res = await api.updateConfig({ geminiApiKey: 'k' })
    expect(res.geminiApiKey).toBe('k')
    expect(deps.configStore.update).toHaveBeenCalledWith({ geminiApiKey: 'k' })
  })

  it('validateGeminiKey ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    expect(await api.validateGeminiKey('k')).toEqual({ valid: true })
    expect(deps.validateGeminiKey).toHaveBeenCalledWith('k')
  })

  it('pickFolder ủy quyền cho dep', async () => {
    const deps = makeDeps()
    const api = createIpcHandlers(deps as never)
    expect(await api.pickFolder()).toBe('/chosen')
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/main/ipcHandlers.test.ts`
Expected: FAIL — `createIpcHandlers` chưa tồn tại.

- [ ] **Step 3: Viết `src/main/ipcHandlers.ts`**

```ts
import { AppApi, AppConfig, GeminiValidationResult } from '../shared/types'
import { ConfigStore } from './config/configStore'

export interface IpcDeps {
  configStore: ConfigStore
  validateGeminiKey: (apiKey: string) => Promise<GeminiValidationResult>
  pickFolder: () => Promise<string | null>
}

export function createIpcHandlers(deps: IpcDeps): AppApi {
  return {
    getConfig: () => deps.configStore.load(),
    updateConfig: (patch: Partial<AppConfig>) => deps.configStore.update(patch),
    validateGeminiKey: (apiKey: string) => deps.validateGeminiKey(apiKey),
    pickFolder: () => deps.pickFolder(),
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/main/ipcHandlers.test.ts`
Expected: 4 test PASS.

- [ ] **Step 5: Wiring trong `src/main/index.ts`** (thay toàn bộ nội dung)

```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './config/configStore'
import { validateGeminiApiKey } from './gemini/geminiClient'
import { createIpcHandlers } from './ipcHandlers'
import { IPC } from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function registerIpc(): void {
  const configStore = new ConfigStore(app.getPath('userData'))
  const pickFolder = async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  }
  const handlers = createIpcHandlers({ configStore, validateGeminiKey: validateGeminiApiKey, pickFolder })

  ipcMain.handle(IPC.getConfig, () => handlers.getConfig())
  ipcMain.handle(IPC.updateConfig, (_e, patch) => handlers.updateConfig(patch))
  ipcMain.handle(IPC.validateGeminiKey, (_e, apiKey: string) => handlers.validateGeminiKey(apiKey))
  ipcMain.handle(IPC.pickFolder, () => handlers.pickFolder())
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: Preload bridge `src/preload/index.ts`** (thay toàn bộ)

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { AppApi, IPC } from '../shared/types'

const api: AppApi = {
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  updateConfig: (patch) => ipcRenderer.invoke(IPC.updateConfig, patch),
  validateGeminiKey: (apiKey) => ipcRenderer.invoke(IPC.validateGeminiKey, apiKey),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 7: Khai báo type cho renderer `src/renderer/src/env.d.ts`**

```ts
import type { AppApi } from '../../shared/types'

declare global {
  interface Window {
    api: AppApi
  }
}

export {}
```

- [ ] **Step 8: Typecheck + chạy app thủ công**

Run: `npm run typecheck`
Expected: không lỗi.

Run: `npm run dev` → mở DevTools Console, gõ `await window.api.getConfig()`
Expected: trả về object config mặc định (backend `local`, template Zalo mặc định).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: IPC handlers + main wiring + preload bridge"
```

---

### Task 7: Settings UI (màn hình Cấu hình)

**Files:**
- Create: `src/renderer/src/pages/SettingsPage.tsx`
- Test: `src/renderer/src/pages/SettingsPage.test.tsx`
- Create: `src/renderer/src/test-setup.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `vitest.config.ts` (thêm setupFiles cho jest-dom)

**Interfaces:**
- Consumes: `window.api` (AppApi), `DEFAULT_CONFIG` từ shared types.
- Produces: component `SettingsPage` render form; các hành vi: tải config khi mount, chọn thư mục, kiểm tra key Gemini (hiện ✓/✗), lưu (gọi `updateConfig`).

- [ ] **Step 1: Thêm setup jest-dom**

`src/renderer/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

Sửa `vitest.config.ts` — thêm `setupFiles`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/renderer/src/test-setup.ts'],
  },
})
```

- [ ] **Step 2: Viết failing test**

`src/renderer/src/pages/SettingsPage.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import SettingsPage from './SettingsPage'
import { DEFAULT_CONFIG } from '../../../shared/types'

function stubApi(overrides: Partial<Window['api']> = {}) {
  const api = {
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    updateConfig: vi.fn(async (patch) => ({ ...DEFAULT_CONFIG, ...patch })),
    validateGeminiKey: vi.fn(async () => ({ valid: true })),
    pickFolder: vi.fn(async () => '/data/mindx'),
    ...overrides,
  }
  ;(window as unknown as { api: Window['api'] }).api = api as Window['api']
  return api
}

beforeEach(() => stubApi())

describe('SettingsPage', () => {
  it('tải & hiển thị template Zalo mặc định khi mount', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText(/mẫu tin nhắn zalo/i)).toHaveValue(DEFAULT_CONFIG.zaloMessageTemplate),
    )
  })

  it('bấm "Chọn thư mục" cập nhật đường dẫn hiển thị', async () => {
    const api = stubApi()
    render(<SettingsPage />)
    await waitFor(() => screen.getByText(/chọn thư mục/i))
    fireEvent.click(screen.getByText(/chọn thư mục/i))
    await waitFor(() => expect(screen.getByText('/data/mindx')).toBeInTheDocument())
    expect(api.pickFolder).toHaveBeenCalled()
  })

  it('bấm "Kiểm tra key" hiện trạng thái hợp lệ', async () => {
    const api = stubApi({ validateGeminiKey: vi.fn(async () => ({ valid: true })) })
    render(<SettingsPage />)
    await waitFor(() => screen.getByLabelText(/api key gemini/i))
    fireEvent.change(screen.getByLabelText(/api key gemini/i), { target: { value: 'k1' } })
    fireEvent.click(screen.getByText(/kiểm tra key/i))
    await waitFor(() => expect(screen.getByText(/key hợp lệ/i)).toBeInTheDocument())
    expect(api.validateGeminiKey).toHaveBeenCalledWith('k1')
  })

  it('key sai hiện thông báo lỗi', async () => {
    stubApi({ validateGeminiKey: vi.fn(async () => ({ valid: false, error: 'API key không hợp lệ.' })) })
    render(<SettingsPage />)
    await waitFor(() => screen.getByLabelText(/api key gemini/i))
    fireEvent.change(screen.getByLabelText(/api key gemini/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByText(/kiểm tra key/i))
    await waitFor(() => expect(screen.getByText(/không hợp lệ/i)).toBeInTheDocument())
  })

  it('bấm "Lưu" gọi updateConfig với dữ liệu đang nhập', async () => {
    const api = stubApi()
    render(<SettingsPage />)
    await waitFor(() => screen.getByLabelText(/api key gemini/i))
    fireEvent.change(screen.getByLabelText(/api key gemini/i), { target: { value: 'k9' } })
    fireEvent.click(screen.getByText(/^lưu$/i))
    await waitFor(() =>
      expect(api.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ geminiApiKey: 'k9', storageBackend: 'local' }),
      ),
    )
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/renderer/src/pages/SettingsPage.test.tsx`
Expected: FAIL — `SettingsPage` chưa tồn tại.

- [ ] **Step 4: Viết `src/renderer/src/pages/SettingsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { AppConfig, DEFAULT_CONFIG } from '../../../shared/types'

type KeyStatus = { checked: boolean; valid: boolean; error?: string }

export default function SettingsPage(): JSX.Element {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ checked: false, valid: false })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  const set = <K extends keyof AppConfig>(k: K, v: AppConfig[K]): void => {
    setConfig(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) set('localFolderPath', folder)
  }

  const checkKey = async (): Promise<void> => {
    const res = await window.api.validateGeminiKey(config.geminiApiKey ?? '')
    setKeyStatus({ checked: true, valid: res.valid, error: res.error })
  }

  const save = async (): Promise<void> => {
    await window.api.updateConfig(config)
    setSaved(true)
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, fontFamily: 'system-ui' }}>
      <h1>Cấu hình</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Kho dữ liệu</h2>
        <label>
          <input
            type="radio"
            name="backend"
            checked={config.storageBackend === 'local'}
            onChange={() => set('storageBackend', 'local')}
          />
          Thư mục trên máy (local)
        </label>
        <br />
        <label style={{ color: '#999' }}>
          <input
            type="radio"
            name="backend"
            disabled
            checked={config.storageBackend === 'supabase'}
          />
          Supabase (chưa khả dụng — bản sau)
        </label>
        <div style={{ marginTop: 8 }}>
          <button onClick={chooseFolder}>Chọn thư mục…</button>{' '}
          <span>{config.localFolderPath ?? '(chưa chọn)'}</span>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Gemini API</h2>
        <label htmlFor="gemini-key">API key Gemini</label>
        <br />
        <input
          id="gemini-key"
          type="password"
          value={config.geminiApiKey ?? ''}
          onChange={e => { set('geminiApiKey', e.target.value); setKeyStatus({ checked: false, valid: false }) }}
          style={{ width: 360 }}
        />{' '}
        <button onClick={checkKey}>Kiểm tra key</button>
        {keyStatus.checked && (
          <div style={{ color: keyStatus.valid ? 'green' : 'crimson' }}>
            {keyStatus.valid ? '✓ Key hợp lệ' : `✗ ${keyStatus.error ?? 'Key không hợp lệ'}`}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Mẫu tin nhắn Zalo</h2>
        <label htmlFor="zalo-template">Mẫu tin nhắn Zalo</label>
        <br />
        <textarea
          id="zalo-template"
          value={config.zaloMessageTemplate}
          onChange={e => set('zaloMessageTemplate', e.target.value)}
          rows={10}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      </section>

      <button onClick={save}>Lưu</button>
      {saved && <span style={{ marginLeft: 12, color: 'green' }}>Đã lưu ✓</span>}
    </div>
  )
}
```

- [ ] **Step 5: Cập nhật `src/renderer/src/App.tsx`**

```tsx
import SettingsPage from './pages/SettingsPage'

export default function App(): JSX.Element {
  return <SettingsPage />
}
```

- [ ] **Step 6: Chạy test để xác nhận PASS**

Run: `npx vitest run src/renderer/src/pages/SettingsPage.test.tsx`
Expected: 5 test PASS.

- [ ] **Step 7: Chạy toàn bộ test + typecheck**

Run: `npm test && npm run typecheck`
Expected: tất cả test PASS, typecheck không lỗi.

- [ ] **Step 8: Chạy app thủ công (nghiệm thu Milestone 1)**

Run: `npm run dev`
Expected: màn hình Cấu hình hiển thị; chọn được thư mục; nhập key + "Kiểm tra key" (dùng key thật từ Google AI Studio → "Key hợp lệ"); "Lưu" → "Đã lưu ✓"; đóng & mở lại app, giá trị đã lưu vẫn còn.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Settings page (storage, Gemini key, Zalo template)"
```

---

## Nghiệm thu Milestone 1 (Definition of Done)

- `npm test` xanh toàn bộ; `npm run typecheck` không lỗi.
- `npm run dev` mở app; màn hình Cấu hình cho phép: chọn thư mục local, nhập & kiểm tra key Gemini, sửa/lưu template Zalo.
- Config được lưu tại `userData/config.json` và còn nguyên sau khi mở lại app.
- Đã commit theo từng task.

## Ngoài phạm vi M1 (cho các plan sau)
- Supabase provider (cần tạo project + schema) — pair với mô hình dữ liệu lớp ở Milestone 2.
- Quản lý lớp / "Tự động thêm lớp" từ LMS.
- Đọc PDF + gọi Gemini sinh/sửa nội dung.
- Tự động hoá Playwright (LMS + Zalo Web), hẹn giờ, báo cáo.
