// Đóng gói thủ công thành folder chạy được (folder chứa .exe, không cần cài Node.js).
// Dùng thay cho electron-builder trên máy không bật Developer Mode (electron-builder
// vướng lỗi tạo symbolic link khi giải nén winCodeSign).
//
// Chạy:  npm run pack     (đã tự chạy electron-vite build trước)
// Kết quả: release/MindX Auto Comment/MindX Auto Comment.exe

import { existsSync, rmSync, mkdirSync, cpSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = join(root, 'release', 'MindX Auto Comment')

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
mkdirSync(rel, { recursive: true })

console.log('Sao chép Electron runtime (~260MB)…')
cpSync(join(root, 'node_modules', 'electron', 'dist'), rel, { recursive: true })

// App được nạp từ resources/app (bỏ app mặc định của Electron).
rmSync(join(rel, 'resources', 'default_app.asar'), { force: true })
const appDir = join(rel, 'resources', 'app')
mkdirSync(join(appDir, 'node_modules'), { recursive: true })

console.log('Sao chép app đã build…')
cpSync(join(root, 'out'), join(appDir, 'out'), { recursive: true })
cpSync(join(root, 'package.json'), join(appDir, 'package.json'))

console.log('Sao chép Playwright (runtime)…')
cpSync(join(root, 'node_modules', 'playwright'), join(appDir, 'node_modules', 'playwright'), { recursive: true })
cpSync(join(root, 'node_modules', 'playwright-core'), join(appDir, 'node_modules', 'playwright-core'), { recursive: true })

// Script điều khiển Zalo PC — main đọc qua process.resourcesPath khi đã đóng gói.
cpSync(join(root, 'resources', 'zalo-desktop-uia.ps1'), join(rel, 'resources', 'zalo-desktop-uia.ps1'))

console.log('Đổi tên electron.exe → "MindX Auto Comment.exe"…')
renameSync(join(rel, 'electron.exe'), join(rel, 'MindX Auto Comment.exe'))

console.log('\n✓ Xong. File chạy:')
console.log(`  ${join(rel, 'MindX Auto Comment.exe')}`)
console.log('Gửi cả thư mục "release/MindX Auto Comment" cho người dùng — double-click file .exe để chạy.')
