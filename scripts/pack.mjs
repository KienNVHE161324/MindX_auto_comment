// Đóng gói thủ công thành folder chạy được (folder chứa .exe, không cần cài Node.js).
// Dùng thay cho electron-builder trên máy không bật Developer Mode (electron-builder
// vướng lỗi tạo symbolic link khi giải nén winCodeSign).
//
// Chạy:  npm run pack     (đã tự chạy electron-vite build trước)
// Kết quả: release/MindX Auto Comment/MindX Auto Comment.exe

import { existsSync, rmSync, mkdirSync, cpSync, renameSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = join(root, 'release', 'MindX Auto Comment')
// Toàn bộ file hệ thống của Electron nằm trong app/ để thư mục ngoài cùng gọn gàng,
// người dùng chỉ thấy 1 file "▶ RUN ME.bat" để bấm chạy.
const appRuntime = join(rel, 'app')

function need(p) {
  if (!existsSync(p)) {
    console.error(`Thiếu "${p}". Hãy chạy "npm run build" trước.`)
    process.exit(1)
  }
}

need(join(root, 'out', 'main', 'index.js'))
need(join(root, 'node_modules', 'electron', 'dist', 'electron.exe'))

console.log('Dọn thư mục release cũ…')
rmSync(join(root, 'release'), { recursive: true, force: true })
mkdirSync(appRuntime, { recursive: true })

console.log('Sao chép Electron runtime (~260MB)…')
cpSync(join(root, 'node_modules', 'electron', 'dist'), appRuntime, { recursive: true })

// App được nạp từ resources/app (bỏ app mặc định của Electron).
rmSync(join(appRuntime, 'resources', 'default_app.asar'), { force: true })
const appDir = join(appRuntime, 'resources', 'app')
mkdirSync(join(appDir, 'node_modules'), { recursive: true })

console.log('Sao chép app đã build…')
cpSync(join(root, 'out'), join(appDir, 'out'), { recursive: true })
cpSync(join(root, 'package.json'), join(appDir, 'package.json'))

console.log('Sao chép Playwright (runtime)…')
cpSync(join(root, 'node_modules', 'playwright'), join(appDir, 'node_modules', 'playwright'), { recursive: true })
cpSync(join(root, 'node_modules', 'playwright-core'), join(appDir, 'node_modules', 'playwright-core'), { recursive: true })

// Script điều khiển Zalo PC — main đọc qua process.resourcesPath khi đã đóng gói.
cpSync(join(root, 'resources', 'zalo-desktop-uia.ps1'), join(appRuntime, 'resources', 'zalo-desktop-uia.ps1'))

console.log('Đổi tên electron.exe → "MindX Auto Comment.exe"…')
renameSync(join(appRuntime, 'electron.exe'), join(appRuntime, 'MindX Auto Comment.exe'))

// Cắt file không cần thiết để giảm dung lượng bản gửi user (~47MB).
console.log('Cắt file thừa (ngôn ngữ khác, license)…')
const localesDir = join(appRuntime, 'locales')
if (existsSync(localesDir)) {
  for (const f of readdirSync(localesDir)) {
    // Giữ lại tiếng Anh; xóa 54 ngôn ngữ khác (~38MB).
    if (f.toLowerCase() !== 'en-us.pak') rmSync(join(localesDir, f), { force: true })
  }
}
rmSync(join(appRuntime, 'LICENSES.chromium.html'), { force: true }) // ~9MB, không cần cho end-user

// Launcher ngoài cùng — dùng đường dẫn tương đối (%~dp0) nên chạy được ở bất kỳ máy nào.
console.log('Tạo "▶ RUN ME.bat"…')
const bat = [
  '@echo off',
  'cd /d "%~dp0app"',
  'start "" "MindX Auto Comment.exe"',
  '',
].join('\r\n')
writeFileSync(join(rel, '▶ RUN ME.bat'), bat, 'utf8')

console.log('\n✓ Xong. Cấu trúc thư mục:')
console.log(`  ${rel}\\`)
console.log('    ▶ RUN ME.bat   <-- người dùng chỉ cần bấm file này')
console.log('    app\\           (file hệ thống, không cần đụng vào)')
console.log('Gửi cả thư mục "MindX Auto Comment" — người dùng bấm "▶ RUN ME.bat" là chạy.')
