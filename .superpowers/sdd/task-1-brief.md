# Task 1: Project scaffold (Electron + Vite + React + TS + Vitest)

## Global Constraints (bind mọi task)
- Ngôn ngữ: **TypeScript** (strict mode bật).
- Nền tảng đích: **Windows** (Electron desktop).
- Bí mật (API key Gemini, phiên đăng nhập) KHÔNG lên cloud.
- Storage backend là interface; M1 chỉ hiện thực `local`. `supabase` hợp lệ trong config nhưng UI đánh dấu "chưa khả dụng".
- Template Zalo mặc định (verbatim) sẽ dùng ở Task 2:
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
- Repo: `C:\Users\Beam1\MindX_auto_comment`. Kết thúc task bằng 1 commit.

## Files
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Test: `src/smoke.test.ts`

## Interfaces
- Consumes: (none)
- Produces: script `npm run dev`, `npm test`, `npm run typecheck`; cấu trúc thư mục src/{shared,main,preload,renderer}.

## Steps

### Step 1: Tạo `.gitignore`
```
node_modules/
out/
dist/
*.log
.DS_Store
```

### Step 2: Tạo `package.json`
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

### Step 3: Cài dependencies
```bash
npm install electron@^31 electron-vite@^2 vite@^5 react@^18 react-dom@^18
npm install -D typescript@^5 @types/react@^18 @types/react-dom@^18 @types/node@^20 @vitejs/plugin-react@^4 vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```
Expected: cài xong, `node_modules/` xuất hiện.

### Step 4: Tạo `electron.vite.config.ts`
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

### Step 5: Tạo các tsconfig
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

### Step 6: Tạo `vitest.config.ts`
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

### Step 7: Tạo entry Electron tối thiểu
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

### Step 8: Viết smoke test
`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('môi trường test chạy được', () => {
    expect(1 + 1).toBe(2)
  })
})
```

### Step 9: Chạy test để chắc chắn PASS
Run: `npm test`
Expected: 1 file test, 1 test PASS.

### Step 10 (GUI — KHÔNG chạy trong subagent)
`npm run dev` mở cửa sổ Electron GUI — KHÔNG chạy lệnh này (sẽ treo phiên). Để controller/con người nghiệm thu thủ công. Thay vào đó chạy `npm run build` để chắc chắn build main/preload/renderer thành công (không mở GUI).

### Step 11: Commit
```bash
git add -A
git commit -m "chore: scaffold Electron + React + TS + Vitest"
```

## Definition of Done cho task này
- `npm test` PASS (smoke test).
- `npm run build` thành công (thay cho việc mở GUI).
- `npm run typecheck` không lỗi.
- Đã commit.
