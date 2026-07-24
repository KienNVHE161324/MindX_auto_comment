import { useState } from 'react'
import SettingsPage from './pages/SettingsPage'
import ClassesPage from './pages/ClassesPage'
import GuidePage from './pages/GuidePage'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<'classes' | 'settings' | 'guide'>('classes')
  return (
    <div>
      <nav className="app-nav">
        <span className="app-brand"><span className="dot" />MindX Auto Comment</span>
        <button className={`tab${tab === 'classes' ? ' active' : ''}`} onClick={() => setTab('classes')}>Lớp học</button>
        <button className={`tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>Cấu hình</button>
        <button className={`tab${tab === 'guide' ? ' active' : ''}`} onClick={() => setTab('guide')}>Hướng dẫn</button>
      </nav>
      {/* Giữ các tab luôn mounted (chỉ ẩn/hiện) để không mất dữ liệu đang nhập khi chuyển tab. */}
      <div style={{ display: tab === 'classes' ? 'block' : 'none' }}>
        <ClassesPage active={tab === 'classes'} />
      </div>
      <div style={{ display: tab === 'settings' ? 'block' : 'none' }}>
        <SettingsPage />
      </div>
      <div style={{ display: tab === 'guide' ? 'block' : 'none' }}>
        <GuidePage />
      </div>
    </div>
  )
}
